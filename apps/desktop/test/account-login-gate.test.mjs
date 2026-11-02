/**
 * The account login gate and its store actions.
 *
 * Source-structure tests in the repo's established style: the gate is a
 * composition of conditions across four files, and a regression in any one of
 * them silently reopens the shell to a signed-out user. Asserting the exact
 * source shape is what keeps the composition honest without booting Electron.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(join(here, relative), "utf8");

const appShell = read("src/features/app/AppShell.tsx");
const runtime = read("src/features/app/useAppShellRuntime.tsx");
const store = read("src/stores/app-store.ts");
const state = read("src/stores/app-state.ts");
const initialState = read("src/stores/slices/initial-state.ts");
const login = read("src/components/LoginScreen.tsx");
const api = read("src/lib/api.ts");
const protocol = read("../../packages/shared/src/protocol.ts");
const mainIndex = read("electron/main/index.ts");
const accountIpc = read("electron/main/ipc/account-ipc.ts");
const service = read("electron/main/account/service.ts");

test("the shell resolves only after the account read settles", () => {
  assert.match(
    runtime,
    /bootResolved: ready && accountResolved/,
    "the splash must not give way before the gate knows who is signed in",
  );
});

test("a signed-out account replaces the whole shell with the sign-in surface", () => {
  const gateStart = appShell.indexOf("let shell: ReactNode = null;");
  assert.ok(gateStart >= 0, "the shell composition point exists");
  const gate = appShell.slice(gateStart, gateStart + 900);
  assert.match(
    gate,
    /if \(bootResolved && !account\.signedIn\) \{/,
    "the signed-out branch must be the first branch inside the resolved shell",
  );
  assert.match(gate, /shell = <LoginScreen \/>;/);
  // The shell body is the else branch, so nothing mounts beside the gate.
  assert.match(gate, /\} else if \(bootResolved\) \{/);
});

test("window chrome and project creation stay behind the gate", () => {
  assert.match(appShell, /\{\(bootResolved && account\.signedIn && !showSplash\) \|\| startupPhase !== "starting"/);
  assert.match(appShell, /\{account\.signedIn \? <ProjectCreateDialog \/> : null\}/);
});

test("menu commands are inert while the gate is closed", () => {
  assert.match(
    runtime,
    /if \(!store\.account\.signedIn\) return;/,
    "a tray or menu command must not mutate sessions for a signed-out shell",
  );
});

test("the store applies an identity push from main", () => {
  assert.match(runtime, /api\.onAccountChanged\(\(state\) =>/);
  assert.match(runtime, /useAppStore\.getState\(\)\.applyAccountState\(state\)/);
});

test("opening the gate lands on the chat page with a clean stack", () => {
  const actionStart = store.indexOf("applyAccountState: (account) => {");
  assert.ok(actionStart >= 0, "applyAccountState exists in the store");
  const action = store.slice(actionStart, actionStart + 2400);
  assert.match(action, /page: "chat",/);
  assert.match(action, /navStack: \[\{ page: "chat" \}\],/);
  assert.match(action, /navIndex: 0,/);
});

test("the AppState contract carries the gate", () => {
  assert.match(state, /account: AccountState;/);
  assert.match(state, /accountResolved: boolean;/);
  assert.match(state, /refreshAccount: \(\) => Promise<void>;/);
  assert.match(state, /applyAccountState: \(state: AccountState\) => void;/);
});

test("closing the gate drops the previous account's working state", () => {
  const actionStart = store.indexOf("applyAccountState: (account) => {");
  const action = store.slice(actionStart, actionStart + 2400);
  assert.match(action, /activeSessionId: undefined,/);
  assert.match(action, /messages: \[\],/);
  assert.match(action, /providers: \[\],/);
});

test("the gate starts closed and unresolved", () => {
  assert.match(initialState, /account: SIGNED_OUT_ACCOUNT_STATE,/);
  assert.match(initialState, /accountResolved: false,/);
});

test("a failed account read does not report a signed-out account", () => {
  const refreshStart = store.indexOf("refreshAccount: async () => {");
  assert.ok(refreshStart >= 0);
  const refresh = store.slice(refreshStart, refreshStart + 1200);
  assert.match(refresh, /accountResolved: false,/);
  assert.doesNotMatch(refresh, /account: SIGNED_OUT_ACCOUNT_STATE/);
});

test("the renderer reaches the account service only through the bridge", () => {
  for (const channel of [
    "accountCaptchaGet",
    "accountSignIn",
    "accountSignOut",
    "accountStateGet",
    "accountProfileRefresh",
  ]) {
    assert.ok(protocol.includes(`${channel}:`), `protocol declares ${channel}`);
    assert.ok(api.includes(`IPC.invoke.${channel}`), `api exposes ${channel}`);
  }
  assert.ok(protocol.includes('accountChanged: "pi-desktop/account/event/changed"'));
  // No fetch or XMLHttpRequest anywhere in the renderer's account path: the
  // CORS wildcard plus credentials would drop the long-lived cookie anyway.
  for (const file of [login, api]) {
    assert.doesNotMatch(file, /\bfetch\(/);
    assert.doesNotMatch(file, /XMLHttpRequest/);
  }
});

test("the sign-in surface never keeps the password after it settles", () => {
  assert.match(login, /setPassword\(""\);/);
  // The password is component state only; it must not enter the store.
  assert.doesNotMatch(login, /useAppStore\.setState\(/);
});

test("a spent challenge is always replaced, never retried", () => {
  // The service consumes the ticket on every attempt, so the only correct
  // response to a failure is a fresh one.
  const failureBlock = login.slice(login.indexOf("} catch (error) {"));
  assert.match(failureBlock, /fetchCaptcha\(/);
  assert.match(login, /void fetchCaptcha\(\{ clearInput: true, focus: true \}\);/);
});

test("the captcha field survives a missing challenge", () => {
  // The failure this guards is invisible in a healthy demo: when the challenge
  // cannot be fetched, a conditional on the response removes the field entirely
  // and the user is handed a form that is silently missing a required input.
  // Only a service that answers `captchaEnabled: false` may drop it.
  assert.match(
    login,
    /\{captcha\?\.captchaEnabled !== false \? \(/,
    "the field must render unless the service explicitly disabled it",
  );
  // Its own loading and retry states, so the plate is never blank.
  assert.match(login, /login-captcha-skeleton/);
  assert.match(login, /t\("account\.captchaRetry"\)/);
  assert.match(login, /setCaptchaLoading\(true\)/);
  assert.match(login, /setCaptchaLoading\(false\)/);
});

test("an unfetched challenge is never read as an unnecessary one", () => {
  // `captcha?.captchaEnabled ?? false` would let an unreachable service
  // downgrade sign-in to no-captcha and post a request the service rejects.
  assert.match(login, /const captchaEnabled = captcha\?\.captchaEnabled \?\? true;/);
  const guard = login.slice(
    login.indexOf("const captchaEnabled ="),
    login.indexOf("validateAccountInput("),
  );
  assert.match(
    guard,
    /if \(captchaEnabled && !captcha\) \{[\s\S]*?return;[\s\S]*?\}/,
    "sign-in must refuse to submit until the challenge is in hand",
  );
  assert.match(guard, /account\.error\.captchaUnavailable/);
});

test("main owns the HTTP conversation and the credentials", () => {
  assert.match(mainIndex, /createAccountService\(/);
  assert.match(mainIndex, /createGunyuClient\(/);
  assert.match(mainIndex, /createCredentialStore\(/);
  assert.match(mainIndex, /safeStorage\.isEncryptionAvailable\(\)/);
  assert.match(mainIndex, /sendToRenderer\(IPC\.event\.accountChanged, state\)/);
  assert.match(mainIndex, /void accountService\.restore\(\)/);
  assert.match(accountIpc, /registrar\.handle\(IPC\.invoke\.accountSignIn/);
});

test("the service keeps the documented rotation and revocation rules", () => {
  // §6.4 one credential-less request at a time.
  assert.match(service, /if \(restoring\) return restoring;/);
  // §3.2 sign out with an explicit Authorization.
  assert.match(service, /client\.disableRemember\(\{ token, allDevices: false \}\)/);
  // §6.6 revoke before switching accounts.
  assert.match(service, /revokePreviousIfSwitching\(username\)/);
});
