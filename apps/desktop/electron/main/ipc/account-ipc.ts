/**
 * Account IPC: the renderer's only route to the sign-in gate.
 *
 * Five invokes and one event. Every one is served from the main process's
 * {@link AccountService}, so the renderer never holds a token, a cookie, or a
 * password after the sign-in call returns — and never issues an HTTP request to
 * the account service at all, which it could not do anyway (see
 * `../account/gunyu-client.ts`).
 *
 * Errors are rethrown as-is: the bridge's `wrap()` reads an
 * `AccountServiceError`'s `errorCode` and the renderer maps that code to a
 * localized message through `accountErrorKey`. The service's own rejection text
 * is never forwarded to the UI.
 */
import { IPC, type AccountSignInInput, type AccountState } from "@pi-desktop/shared";
import type { AccountService } from "../account/service";
import type { IpcRegistrar } from "./types";

export type AccountIpcDependencies = {
  registrar: IpcRegistrar;
  service: AccountService;
  /**
   * Re-apply window chrome that depends on whether the gate is open.
   *
   * Called on the boot state read as well as on every change, because the boot
   * read is the first moment the main window is guaranteed to exist: the
   * restore that fires the first `accountChanged` can settle before the window
   * is created, and a chrome decision made then would be dropped.
   */
  syncWindowChrome?: (signedIn: boolean) => void;
};

/** Register the account gate channels. */
export function registerAccountIpc({
  registrar,
  service,
  syncWindowChrome,
}: AccountIpcDependencies): void {
  registrar.handle(IPC.invoke.accountCaptchaGet, async () => service.captcha());

  registrar.handle(IPC.invoke.accountSignIn, async (input: AccountSignInInput) =>
    service.signIn(input),
  );

  registrar.handle(IPC.invoke.accountSignOut, async () => service.signOut());

  /**
   * The state the gate reads at boot.
   *
   * Synchronous in effect: it answers from the in-memory snapshot the boot
   * restore already settled, so the renderer never waits on a network round
   * trip to find out whether it may mount the shell.
   */
  registrar.handle(IPC.invoke.accountStateGet, async () => {
    const state = service.state();
    syncWindowChrome?.(state.signedIn);
    return state;
  });

  /**
   * Re-read the profile, renewing the session on the way if it lapsed.
   *
   * Driven by window focus. `probe()` is a no-op while the session is outside
   * its renewal lead, so focusing the window costs nothing.
   */
  registrar.handle(IPC.invoke.accountProfileRefresh, async () => service.probe());
}

/** The state payload the `accountChanged` event carries. */
export type AccountChangedPayload = AccountState;
