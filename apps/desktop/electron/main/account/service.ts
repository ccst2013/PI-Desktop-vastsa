/**
 * The account state machine.
 *
 * One instance per app, owned by the main process. It is the only thing that
 * holds a credential, the only thing that talks to the account service, and the
 * only thing that decides whether the renderer's gate is open.
 *
 * Four rules from `docs/remember-me-client-integration.md` are load-bearing
 * here, and each is asserted by `test/account-service.test.mjs`:
 *
 * - **§6.4 — never send concurrent credential-less requests.** The first one
 *   rotates the long-lived credential; the others replay a value that stops
 *   being accepted after the 60-second grace period, which the service judges
 *   theft and answers by revoking the account on every device. `restore()` is
 *   therefore single-flight: concurrent callers share one in-flight promise.
 *
 * - **§6.3 — persist the rotated credential immediately.** An automatic
 *   sign-in hands back a new `GUANYU_REMEMBER`; if it is not on disk before the
 *   next launch or the next probe, the stale copy triggers the same revocation.
 *
 * - **§6.6 — revoke before switching accounts.** Signing in as someone else
 *   while the previous account's credential is still stored would let the next
 *   automatic sign-in land in the wrong account.
 *
 * - **§3.2 — sign out with an explicit `Authorization`.** `/rememberDisable`
 *   sits behind the automatic sign-in middleware, so a credential-less call
 *   would be silently re-authenticated and succeed without revoking anything.
 *
 * The session token itself is only ever refreshed by the service; this module
 * never mints one.
 */
import {
  SIGNED_OUT_ACCOUNT_STATE,
  type AccountCaptcha,
  type AccountProfile,
  type AccountSignInInput,
  type AccountState,
} from "@pi-desktop/shared";
import {
  AccountServiceError,
  type GunyuClient,
  type InfoResult,
} from "./gunyu-client.ts";
import type { CredentialStore, StoredAccount } from "./credential-store.ts";

/** How long before the reported expiry a probe tries to renew. */
export const SESSION_RENEWAL_LEAD_SECONDS = 5 * 60;

export type AccountServiceOptions = {
  client: GunyuClient;
  store: CredentialStore;
  /** Called after every state transition, including the initial restore. */
  onChanged: (state: AccountState) => void;
  log?: (level: "warn" | "error", message: string, data?: Record<string, unknown>) => void;
  /** Injectable clock, in Unix seconds. */
  now?: () => number;
};

export interface AccountService {
  /** The identity the renderer may see. Never carries a credential. */
  state(): AccountState;
  /** A fresh single-use graphical challenge. */
  captcha(): Promise<AccountCaptcha>;
  /** Exchange credentials for a session, then open the gate. */
  signIn(input: AccountSignInInput): Promise<AccountState>;
  /** Revoke, clear, and close the gate. Always closes it locally. */
  signOut(): Promise<AccountState>;
  /**
   * Resolve the stored account without asking the user for anything.
   *
   * Single-flight. Uses the session token while it is valid, falls back to the
   * long-lived credential once it lapses, and signs out when neither works.
   */
  restore(): Promise<AccountState>;
  /**
   * Re-read the profile, renewing the session on the way if it lapsed.
   *
   * Safe to call on window focus: it does nothing when the session is still
   * valid, and it never throws — a failed probe leaves the current state alone.
   */
  probe(): Promise<AccountState>;
  /** Stop the renewal timer. Called on quit. */
  dispose(): void;
}

function profileFrom(info: InfoResult): AccountProfile {
  return {
    userId: info.user.userId,
    userName: info.user.userName,
    nickName: info.user.nickName,
    email: info.user.email,
    phonenumber: info.user.phonenumber,
    sex: info.user.sex,
    avatar: info.user.avatar,
    deptName: info.user.deptName,
    admin: info.user.admin,
    roles: info.roles,
    permissions: info.permissions,
  };
}

function displayNameOf(profile: AccountProfile | null, username: string): string {
  const nickname = profile?.nickName?.trim();
  return nickname && nickname.length > 0 ? nickname : username;
}

function stateFrom(account: StoredAccount): AccountState {
  return {
    signedIn: true,
    username: account.username,
    displayName: displayNameOf(account.profile, account.username),
    rememberMe: account.rememberMe,
    expiresAt: account.expiresAt,
    profile: account.profile,
  };
}

export function createAccountService(options: AccountServiceOptions): AccountService {
  const { client, store, onChanged } = options;
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  let current: AccountState = SIGNED_OUT_ACCOUNT_STATE;
  /** The credentials behind `current`. Never leaves this module. */
  let secrets: { token: string; rememberCookie: string | null } | null = null;
  /** The in-flight restore, so concurrent callers share one request. */
  let restoring: Promise<AccountState> | null = null;
  let renewalTimer: NodeJS.Timeout | null = null;

  const publish = (next: AccountState): AccountState => {
    current = next;
    try {
      onChanged(next);
    } catch (error) {
      // A listener that throws must not strand the state machine.
      log("error", "account change listener failed", {
        cause: error instanceof Error ? error.name : "unknown",
      });
    }
    return next;
  };

  const signOutLocally = async (): Promise<AccountState> => {
    secrets = null;
    clearRenewalTimer();
    await store.clear().catch((error) => {
      log("error", "account record could not be cleared", {
        cause: error instanceof Error ? error.name : "unknown",
      });
    });
    return publish(SIGNED_OUT_ACCOUNT_STATE);
  };

  /**
   * Arm the renewal timer for a session that just landed.
   *
   * The service renews a session on its own inside the last 20 minutes of its
   * life, but only if something asks it to. This app's business calls do not go
   * to the account service, so nothing would ever ask: the timer is what turns
   * "the session lapsed while the app sat open" into a silent renewal instead
   * of a sign-out.
   */
  const armRenewalTimer = (expiresAt: number | null) => {
    clearRenewalTimer();
    if (expiresAt === null) return;
    const delaySeconds = expiresAt - SESSION_RENEWAL_LEAD_SECONDS - now();
    // A session that is already inside the lead window renews on the next
    // probe rather than in a tight loop.
    if (delaySeconds <= 0) return;
    renewalTimer = setTimeout(() => {
      renewalTimer = null;
      void probe().catch(() => undefined);
    }, Math.min(delaySeconds, 2_147_483) * 1000);
    // Never hold the process open for a renewal.
    renewalTimer.unref?.();
  };

  function clearRenewalTimer() {
    if (renewalTimer) {
      clearTimeout(renewalTimer);
      renewalTimer = null;
    }
  }

  /**
   * Adopt a session: remember the credentials, persist them, publish, and arm
   * the renewal timer. The single path every successful authentication takes.
   */
  const adopt = async (account: StoredAccount): Promise<AccountState> => {
    secrets = { token: account.token, rememberCookie: account.rememberCookie };
    await store.write(account);
    const next = stateFrom(account);
    armRenewalTimer(next.expiresAt);
    return publish(next);
  };

  /**
   * Revoke the stored long-lived credential before a different account takes
   * over (§6.6). Best-effort: an unreachable service must not block a sign-in,
   * and the credential is dropped locally either way.
   */
  const revokePreviousIfSwitching = async (username: string): Promise<void> => {
    const stored = await store.read().catch(() => null);
    if (!stored || !stored.rememberCookie) return;
    if (stored.username === username) return;
    try {
      // Explicit Authorization: without it the middleware would auto-login the
      // old account and the revoke would be a no-op (§3.2).
      await client.disableRemember({ token: stored.token, allDevices: false });
    } catch (error) {
      log("warn", "previous account credential could not be revoked", {
        cause: error instanceof Error ? (error as AccountServiceError).code ?? "unknown" : "unknown",
      });
    }
    await store.clear().catch(() => undefined);
  };

  const restoreOnce = async (): Promise<AccountState> => {
    const stored = await store.read().catch((error) => {
      log("error", "account record could not be read", {
        cause: error instanceof Error ? error.name : "unknown",
      });
      return null;
    });

    if (!stored) {
      secrets = null;
      clearRenewalTimer();
      return publish(SIGNED_OUT_ACCOUNT_STATE);
    }

    const sessionValid = stored.expiresAt === null || stored.expiresAt > now();
    // Inside the lead the session still works but is about to lapse, and the
    // service only renews it when something asks. Nothing else in this app calls
    // the account service, so without this the session would simply die.
    const needsRenewal =
      stored.expiresAt !== null &&
      stored.expiresAt - SESSION_RENEWAL_LEAD_SECONDS <= now();

    /** Keep the stored session as-is, with no round trip. */
    const keepStored = (): AccountState => {
      secrets = { token: stored.token, rememberCookie: stored.rememberCookie };
      armRenewalTimer(stored.expiresAt);
      return publish(stateFrom(stored));
    };

    // A session that is nowhere near its expiry needs no round trip at all.
    // Launching the app must not depend on the account service being up.
    if (sessionValid && !needsRenewal && stored.token) return keepStored();

    if (!stored.rememberCookie) {
      if (sessionValid && stored.token) {
        // Still usable, just not renewable: the user did not ask to be
        // remembered. Keep the session until it actually lapses rather than
        // signing out early.
        return keepStored();
      }
      // Nothing to restore with. This is the "session expired, sign in again"
      // path.
      return signOutLocally();
    }

    try {
      // No Authorization on purpose: a credential-only request is exactly what
      // triggers the service's automatic sign-in (§3.3).
      const info = await client.info({ token: null, rememberCookie: stored.rememberCookie });
      if (!info.rotatedToken) {
        // The middleware rebuilt the session but handed back no token. A session
        // that is still valid keeps working on its stored token; one that has
        // lapsed has nothing left to authenticate with.
        return sessionValid && stored.token ? keepStored() : signOutLocally();
      }
      return adopt({
        username: stored.username,
        token: info.rotatedToken,
        // §6.3: `adopt` persists this before it returns, so a crash afterwards
        // cannot leave the stale credential as the only copy — replaying that
        // past the 60-second grace period revokes the account on every device.
        rememberCookie: info.rememberCookie ?? stored.rememberCookie,
        // The rebuilt session's lifetime is reported only as the `Admin-Token`
        // cookie's `Max-Age`. Keeping the lapsed expiry instead would leave the
        // renewal timer armed permanently in the past.
        expiresAt:
          info.rotatedExpiresIn !== null && info.rotatedExpiresIn > 0
            ? now() + info.rotatedExpiresIn
            : null,
        rememberMe: true,
        profile: profileFrom(info),
      });
    } catch (error) {
      const code = error instanceof AccountServiceError ? error.code : "AUTH_CLIENT";
      // A verdict on the credential — lapsed, judged stolen, account disabled,
      // password changed — arrives as a 401 and must clear it. Every retry would
      // fail the same way, and the service has already revoked the record.
      if (code === "SESSION_EXPIRED" || code === "AUTH_REJECTED") {
        log("warn", "account credential was rejected", { code });
        return signOutLocally();
      }
      // Anything else is a failure to reach the service, not a verdict on the
      // credential. Keep the record: clearing it here would cost the user a
      // passwordless return over a transient outage.
      log("warn", "account could not be restored", { code });
      if (sessionValid && stored.token) return keepStored();
      secrets = null;
      clearRenewalTimer();
      return publish(SIGNED_OUT_ACCOUNT_STATE);
    }
  };

  const probe = async (): Promise<AccountState> => {
    // A session still outside the renewal lead needs nothing; this is what makes
    // a window-focus probe free.
    if (
      current.signedIn &&
      secrets?.token &&
      (current.expiresAt === null || current.expiresAt - SESSION_RENEWAL_LEAD_SECONDS > now())
    ) {
      return current;
    }
    return restore();
  };

  const restore = (): Promise<AccountState> => {
    // §6.4: one credential-less request at a time. A second caller joins the
    // first rather than racing it and replaying a rotated credential.
    if (restoring) return restoring;
    const run = restoreOnce().finally(() => {
      restoring = null;
    });
    restoring = run;
    return run;
  };

  return {
    state: () => current,

    async captcha() {
      const result = await client.captcha();
      return {
        uuid: result.uuid,
        // The service sends bare base64 and expects the client to add the
        // prefix; done once here so no component has to know.
        imageDataUrl: result.img ? `data:image/png;base64,${result.img}` : "",
        captchaEnabled: result.captchaEnabled,
      };
    },

    async signIn(input) {
      const username = input.username.trim();
      if (!username || !input.password) {
        throw new AccountServiceError("AUTH_CLIENT", "a username and password are required");
      }

      await revokePreviousIfSwitching(username);

      const login = await client.login({
        username,
        password: input.password,
        code: input.code.trim(),
        uuid: input.uuid,
        rememberMe: input.rememberMe,
      });

      // The password has served its purpose; nothing below may reference it.
      let info: InfoResult;
      try {
        info = await client.info({ token: login.token });
      } catch (error) {
        // The sign-in itself succeeded, so the session is real. A profile read
        // that fails must not throw the user back to the form: adopt the
        // session with no profile and let the next probe fill it in.
        log("warn", "profile could not be read after sign-in", {
          cause: error instanceof AccountServiceError ? error.code : "unknown",
        });
        return adopt({
          username,
          token: login.token,
          rememberCookie: login.rememberMe ? login.rememberCookie : null,
          expiresAt: login.expiresIn > 0 ? now() + login.expiresIn : null,
          rememberMe: login.rememberMe,
          profile: null,
        });
      }

      const profile = profileFrom(info);
      return adopt({
        username,
        token: login.token,
        // Read the service's answer, not the checkbox: issuance degrades
        // silently to false while the sign-in still succeeds.
        rememberCookie: login.rememberMe ? login.rememberCookie : null,
        expiresAt: login.expiresIn > 0 ? now() + login.expiresIn : null,
        rememberMe: login.rememberMe,
        profile,
      });
    },

    async signOut() {
      const stored = await store.read().catch(() => null);
      const token = secrets?.token ?? stored?.token ?? null;

      if (token) {
        try {
          // Explicit Authorization, so the middleware cannot turn this into an
          // automatic sign-in that revokes nothing (§3.2).
          if (secrets?.rememberCookie || stored?.rememberCookie) {
            await client.disableRemember({ token, allDevices: false });
          }
        } catch (error) {
          log("warn", "remember credential could not be revoked on sign-out", {
            cause: error instanceof AccountServiceError ? error.code : "unknown",
          });
        }
        try {
          // `/logout` does not revoke the long-lived credential, which is why
          // the call above comes first.
          await client.logout({ token });
        } catch (error) {
          log("warn", "session could not be ended on sign-out", {
            cause: error instanceof AccountServiceError ? error.code : "unknown",
          });
        }
      }

      // An unreachable service must not keep the user signed in: the local
      // record is dropped and the gate closes either way.
      return signOutLocally();
    },

    restore,
    probe,

    dispose() {
      clearRenewalTimer();
    },
  };
}
