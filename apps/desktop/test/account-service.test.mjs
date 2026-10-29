/**
 * The account state machine's timing rules.
 *
 * Every assertion here maps to a constraint in
 * `docs/remember-me-client-integration.md` whose violation is not a local
 * inconvenience: replaying a rotated credential past the grace period makes the
 * service judge the account stolen and revoke it on every device. The client is
 * faked so the tests count requests rather than wait on a network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createAccountService } from "../electron/main/account/service.ts";
import { AccountServiceError } from "../electron/main/account/gunyu-client.ts";

const REMEMBER = "series-abc:token-xyz";
const ROTATED_REMEMBER = "series-abc:token-ROTATED";

const PROFILE = {
  userId: 1,
  userName: "admin",
  nickName: "若依",
  email: "ry@163.com",
  phonenumber: null,
  sex: "1",
  avatar: null,
  deptName: "研发部门",
  admin: true,
};

/** A client fake that records every call it received. */
function fakeClient(overrides = {}) {
  const calls = [];
  const record = (name, input) => calls.push({ name, input });
  return {
    calls,
    baseUrl: "http://127.0.0.1:1/dev-api",
    captcha: async () => {
      record("captcha");
      return overrides.captcha?.() ?? { uuid: "ticket-1", img: "QUJD", captchaEnabled: true };
    },
    login: async (input) => {
      record("login", input);
      if (overrides.login) return overrides.login(input);
      return {
        token: "session-token-1",
        expiresIn: 3600,
        rememberMe: input.rememberMe,
        rememberCookie: input.rememberMe ? REMEMBER : null,
      };
    },
    info: async (input) => {
      record("info", input);
      if (overrides.info) return overrides.info(input);
      return {
        user: PROFILE,
        roles: ["admin"],
        permissions: ["*:*:*"],
        // Only a credential-less call rotates the session.
        rotatedToken: input.token ? null : "rotated-session",
        rotatedExpiresIn: input.token ? null : 3600,
        rememberCookie: input.token ? null : ROTATED_REMEMBER,
      };
    },
    disableRemember: async (input) => {
      record("disableRemember", input);
      if (overrides.disableRemember) return overrides.disableRemember(input);
    },
    logout: async (input) => {
      record("logout", input);
      if (overrides.logout) return overrides.logout(input);
    },
  };
}

/** An in-memory credential store that records what was persisted. */
function fakeStore(initial = null) {
  const writes = [];
  let stored = initial;
  return {
    writes,
    degraded: false,
    get stored() {
      return stored;
    },
    async read() {
      return stored;
    },
    async write(account) {
      writes.push(account);
      stored = account;
    },
    async rotate(rememberCookie, token, expiresAt) {
      if (!stored) return;
      stored = {
        ...stored,
        ...(rememberCookie !== null && rememberCookie !== undefined ? { rememberCookie } : {}),
        ...(typeof token === "string" ? { token } : {}),
        ...(typeof expiresAt === "number" ? { expiresAt } : {}),
      };
      writes.push(stored);
    },
    async clear() {
      writes.push(null);
      stored = null;
    },
  };
}

function harness({ client, store, now = 1_800_000_000 } = {}) {
  const published = [];
  const usedClient = client ?? fakeClient();
  const usedStore = store ?? fakeStore();
  const service = createAccountService({
    client: usedClient,
    store: usedStore,
    onChanged: (state) => published.push(state),
    now: () => now,
  });
  return { service, client: usedClient, store: usedStore, published };
}

const signInInput = {
  username: "admin",
  password: "admin123",
  code: "4927",
  uuid: "ticket-1",
  rememberMe: true,
};

test("a successful sign-in persists the session and opens the gate", async () => {
  const { service, store, published } = harness();
  const state = await service.signIn(signInInput);

  assert.equal(state.signedIn, true);
  assert.equal(state.username, "admin");
  assert.equal(state.displayName, "若依");
  assert.equal(state.rememberMe, true);
  assert.equal(state.expiresAt, 1_800_000_000 + 3600);
  assert.equal(state.profile.userName, "admin");
  assert.deepEqual(state.profile.roles, ["admin"]);

  // Persisted exactly once, with the credential the service issued.
  assert.equal(store.writes.length, 1);
  assert.equal(store.stored.rememberCookie, REMEMBER);
  assert.equal(published.length, 1);
  assert.equal(published[0].signedIn, true);
});

test("the state handed to the renderer carries no credential", async () => {
  const { service } = harness();
  const state = await service.signIn(signInInput);
  const serialized = JSON.stringify(state);
  assert.ok(!serialized.includes(REMEMBER), "the long-lived credential reached the renderer");
  assert.ok(!serialized.includes("session-token-1"), "the session token reached the renderer");
  assert.ok(!serialized.includes("admin123"), "the password reached the renderer");
  assert.equal("token" in state, false);
  assert.equal("rememberCookie" in state, false);
});

test("a refused sign-in persists nothing and publishes nothing", async () => {
  const client = fakeClient({
    login: () => {
      throw new AccountServiceError("AUTH_REJECTED", "refused");
    },
  });
  const { service, store, published } = harness({ client });

  await assert.rejects(() => service.signIn(signInInput), (error) => {
    assert.equal(error.code, "AUTH_REJECTED");
    return true;
  });

  assert.equal(store.writes.length, 0);
  assert.equal(published.length, 0);
  assert.equal(service.state().signedIn, false);
});

test("the challenge image gets the data prefix the service omits", async () => {
  const { service } = harness();
  const captcha = await service.captcha();
  assert.equal(captcha.uuid, "ticket-1");
  assert.equal(captcha.imageDataUrl, "data:image/png;base64,QUJD");
  assert.equal(captcha.captchaEnabled, true);
});

test("a deployment with the challenge off reports it, so the form hides the field", async () => {
  const client = fakeClient({
    captcha: () => ({ uuid: "ticket-1", img: "", captchaEnabled: false }),
  });
  const { service } = harness({ client });
  const captcha = await service.captcha();
  assert.equal(captcha.captchaEnabled, false);
  assert.equal(captcha.imageDataUrl, "");
});

test("restore with a live session makes no request at all", async () => {
  // Launching the app must not depend on the account service being up.
  const store = fakeStore({
    username: "admin",
    token: "session-token-1",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 + 600,
    rememberMe: true,
    profile: PROFILE,
  });
  const { service, client } = harness({ store });

  const state = await service.restore();
  assert.equal(state.signedIn, true);
  assert.equal(state.username, "admin");
  assert.equal(client.calls.length, 0, "a live session should not touch the network");
});

test("restore with no stored account signs out without a request", async () => {
  const { service, client, published } = harness();
  const state = await service.restore();
  assert.equal(state.signedIn, false);
  assert.equal(client.calls.length, 0);
  assert.equal(published.at(-1).signedIn, false);
});

test("a lapsed session with no credential is the sign-in-again path", async () => {
  // The user did not ask to be remembered: there is nothing to restore with.
  const store = fakeStore({
    username: "admin",
    token: "session-token-1",
    rememberCookie: null,
    expiresAt: 1_800_000_000 - 10,
    rememberMe: false,
    profile: PROFILE,
  });
  const { service, client } = harness({ store });

  const state = await service.restore();
  assert.equal(state.signedIn, false);
  assert.equal(client.calls.length, 0, "no credential means nothing to try");
  assert.equal(store.stored, null, "the lapsed record is cleared");
});

test("a lapsed session restores through the credential without an Authorization header", async () => {
  const store = fakeStore({
    username: "admin",
    token: "expired-token",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 - 10,
    rememberMe: true,
    profile: null,
  });
  const { service, client } = harness({ store });

  const state = await service.restore();
  assert.equal(state.signedIn, true);
  assert.equal(state.displayName, "若依", "the profile is read on the way back in");

  const infoCall = client.calls.find((call) => call.name === "info");
  assert.ok(infoCall, "the credential path calls getInfo");
  // The middleware only triggers when Authorization is absent.
  assert.equal(infoCall.input.token, null);
  assert.equal(infoCall.input.rememberCookie, REMEMBER);

  // The rebuilt session's lifetime comes from the rotated cookie's Max-Age.
  assert.equal(state.expiresAt, 1_800_000_000 + 3600);
});

test("the rotated credential is persisted before restore returns", async () => {
  // §6.3: a stale credential replayed past the grace period revokes every device.
  const store = fakeStore({
    username: "admin",
    token: "expired-token",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 - 10,
    rememberMe: true,
    profile: null,
  });
  const { service } = harness({ store });

  await service.restore();
  assert.equal(store.stored.rememberCookie, ROTATED_REMEMBER);
  assert.equal(store.stored.token, "rotated-session");
});

test("concurrent restores send exactly one credential-less request", async () => {
  // §6.4: the first rotates the credential; a second concurrent request would
  // replay the stale value and be judged theft.
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const client = fakeClient({
    info: async (input) => {
      await gate;
      return {
        user: PROFILE,
        roles: ["admin"],
        permissions: ["*:*:*"],
        rotatedToken: input.token ? null : "rotated-session",
        rotatedExpiresIn: input.token ? null : 3600,
        rememberCookie: input.token ? null : ROTATED_REMEMBER,
      };
    },
  });
  const store = fakeStore({
    username: "admin",
    token: "expired-token",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 - 10,
    rememberMe: true,
    profile: null,
  });
  const { service } = harness({ client, store });

  const pending = Promise.all([
    service.restore(),
    service.restore(),
    service.probe(),
    service.restore(),
  ]);
  release();
  const states = await pending;

  const infoCalls = client.calls.filter((call) => call.name === "info");
  assert.equal(infoCalls.length, 1, "concurrent restores must share one request");
  for (const state of states) assert.equal(state.signedIn, true);
});

test("a credential the service rejects closes the gate", async () => {
  // Every 401 reason — lapsed, stolen, disabled account, changed password — is
  // answered identically and must be handled identically.
  const client = fakeClient({
    info: () => {
      throw new AccountServiceError("SESSION_EXPIRED", "refused");
    },
  });
  const store = fakeStore({
    username: "admin",
    token: "expired-token",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 - 10,
    rememberMe: true,
    profile: null,
  });
  const { service } = harness({ client, store });

  const state = await service.restore();
  assert.equal(state.signedIn, false);
  assert.equal(store.stored, null, "a dead credential is dropped, not retried");
});

test("an unreachable service during restore does not sign the user out", async () => {
  // A network fault is not a verdict on the credential. Clearing it here would
  // cost the user a passwordless return for a transient outage.
  const client = fakeClient({
    info: () => {
      throw new AccountServiceError("AUTH_UNREACHABLE", "down");
    },
  });
  const store = fakeStore({
    username: "admin",
    token: "expired-token",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 - 10,
    rememberMe: true,
    profile: null,
  });
  const { service } = harness({ client, store });

  const state = await service.restore();
  assert.equal(state.signedIn, false, "the gate still closes for this launch");
  assert.notEqual(store.stored, null, "but the credential survives the outage");
  assert.equal(store.stored.rememberCookie, REMEMBER);
});

test("signing in as a different account revokes the previous credential first", async () => {
  // §6.6: otherwise the old account's credential stays live and the next
  // automatic sign-in lands in the wrong account.
  const store = fakeStore({
    username: "someone-else",
    token: "old-token",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 + 600,
    rememberMe: true,
    profile: null,
  });
  const { service, client } = harness({ store });

  await service.signIn(signInInput);

  const revokeIndex = client.calls.findIndex((call) => call.name === "disableRemember");
  const loginIndex = client.calls.findIndex((call) => call.name === "login");
  assert.ok(revokeIndex >= 0, "the previous credential was not revoked");
  assert.ok(revokeIndex < loginIndex, "the revoke must precede the new sign-in");
  // §3.2: an explicit token, or the middleware auto-logins and revokes nothing.
  assert.equal(client.calls[revokeIndex].input.token, "old-token");
  assert.equal(store.stored.username, "admin");
});

test("signing in as the same account does not revoke its own credential", async () => {
  const store = fakeStore({
    username: "admin",
    token: "old-token",
    rememberCookie: REMEMBER,
    expiresAt: 1_800_000_000 + 600,
    rememberMe: true,
    profile: null,
  });
  const { service, client } = harness({ store });

  await service.signIn(signInInput);
  assert.equal(
    client.calls.some((call) => call.name === "disableRemember"),
    false,
    "re-signing in as the same user must not revoke the credential it is replacing",
  );
});

test("sign-out revokes with an explicit token, then ends the session", async () => {
  const { service, client, store } = harness();
  await service.signIn(signInInput);
  client.calls.length = 0;

  const state = await service.signOut();
  assert.equal(state.signedIn, false);

  const revoke = client.calls.find((call) => call.name === "disableRemember");
  const logout = client.calls.find((call) => call.name === "logout");
  assert.ok(revoke, "the long-lived credential must be revoked");
  assert.equal(revoke.input.token, "session-token-1");
  assert.ok(logout, "the session must be ended too");
  // `/logout` does not revoke the credential, which is why the order matters.
  assert.ok(
    client.calls.findIndex((call) => call.name === "disableRemember") <
      client.calls.findIndex((call) => call.name === "logout"),
  );
  assert.equal(store.stored, null);
});

test("sign-out closes the gate even when the service is unreachable", async () => {
  const client = fakeClient({
    disableRemember: () => {
      throw new AccountServiceError("AUTH_UNREACHABLE", "down");
    },
    logout: () => {
      throw new AccountServiceError("AUTH_UNREACHABLE", "down");
    },
  });
  const { service, store } = harness({ client });
  await service.signIn(signInInput);

  const state = await service.signOut();
  assert.equal(state.signedIn, false, "a local sign-out must not be blocked by the network");
  assert.equal(store.stored, null);
});

test("sign-out without a credential skips the revoke", async () => {
  const { service, client } = harness();
  await service.signIn({ ...signInInput, rememberMe: false });
  client.calls.length = 0;

  await service.signOut();
  assert.equal(
    client.calls.some((call) => call.name === "disableRemember"),
    false,
    "there is no long-lived credential to revoke",
  );
  assert.ok(client.calls.some((call) => call.name === "logout"));
});

test("rememberMe follows what the service issued, not the checkbox", async () => {
  const client = fakeClient({
    login: () => ({
      token: "session-token-1",
      expiresIn: 3600,
      // Issuance degraded silently; the sign-in still succeeded.
      rememberMe: false,
      rememberCookie: null,
    }),
  });
  const { service, store } = harness({ client });

  const state = await service.signIn({ ...signInInput, rememberMe: true });
  assert.equal(state.rememberMe, false);
  assert.equal(store.stored.rememberCookie, null);
});

test("a profile read that fails after a good sign-in still opens the gate", async () => {
  // The session is real; only the display name is missing. Throwing the user
  // back to the form over a cosmetic read would be wrong.
  const client = fakeClient({
    info: () => {
      throw new AccountServiceError("AUTH_SERVICE_ERROR", "profile unavailable");
    },
  });
  const { service } = harness({ client });

  const state = await service.signIn(signInInput);
  assert.equal(state.signedIn, true);
  assert.equal(state.profile, null);
  assert.equal(state.displayName, "admin", "falls back to the submitted username");
});

test("probe is free while the session is outside its renewal lead", async () => {
  const { service, client } = harness();
  await service.signIn(signInInput);
  client.calls.length = 0;

  await service.probe();
  assert.equal(client.calls.length, 0, "a window focus must not cost a round trip");
});

test("restore renews a session that is inside its renewal lead", async () => {
  // The service only renews a session when something asks, and nothing else in
  // this app calls it: without this the session would simply die at its expiry.
  const store = fakeStore({
    username: "admin",
    token: "session-token-1",
    rememberCookie: REMEMBER,
    // Inside the five-minute lead: still valid, but about to lapse.
    expiresAt: 1_800_000_000 + 60,
    rememberMe: true,
    profile: PROFILE,
  });
  const { service, client } = harness({ store });

  const state = await service.restore();
  assert.equal(state.signedIn, true);
  assert.ok(
    client.calls.some((call) => call.name === "info"),
    "a session inside the lead is renewed rather than left to lapse",
  );
  // The renewed session carries the rebuilt lifetime, not the stale one.
  assert.equal(state.expiresAt, 1_800_000_000 + 3600);
});

test("probe renews an in-memory session that has drifted into the lead", async () => {
  const client = fakeClient({
    // A short-lived session, so the state is inside the lead immediately.
    login: () => ({
      token: "session-token-1",
      expiresIn: 60,
      rememberMe: true,
      rememberCookie: REMEMBER,
    }),
  });
  const { service } = harness({ client });
  await service.signIn(signInInput);
  client.calls.length = 0;

  const state = await service.probe();
  assert.equal(state.signedIn, true);
  assert.ok(
    client.calls.some((call) => call.name === "info"),
    "a window focus inside the lead renews the session",
  );
});

test("an empty username or password never reaches the network", async () => {
  const { service, client } = harness();
  await assert.rejects(
    () => service.signIn({ ...signInInput, username: "   " }),
    (error) => {
      assert.equal(error.code, "AUTH_CLIENT");
      return true;
    },
  );
  await assert.rejects(
    () => service.signIn({ ...signInInput, password: "" }),
    (error) => {
      assert.equal(error.code, "AUTH_CLIENT");
      return true;
    },
  );
  assert.equal(client.calls.length, 0);
});

test("the username is trimmed before it is submitted and stored", async () => {
  const { service, client, store } = harness();
  await service.signIn({ ...signInInput, username: "  admin  " });
  assert.equal(client.calls.find((call) => call.name === "login").input.username, "admin");
  assert.equal(store.stored.username, "admin");
});

test("a throwing listener does not strand the state machine", async () => {
  const store = fakeStore();
  const service = createAccountService({
    client: fakeClient(),
    store,
    onChanged: () => {
      throw new Error("listener blew up");
    },
  });
  const state = await service.signIn(signInInput);
  assert.equal(state.signedIn, true);
  assert.equal(service.state().signedIn, true);
});
