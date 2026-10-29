# ADR: The account sign-in gate

Sign-in is the outermost gate of the application. When no account is active, the
sign-in surface replaces the whole shell — sidebar, chat, work panel, settings —
so none of the app's own navigation can route around it. The gate resolves
before the shell mounts: `bootResolved = ready && accountResolved`, and a
signed-out account renders `<LoginScreen />` as the first branch of the resolved
shell.

The account service is the `gunyu` backend described in
`docs/remember-me-client-integration.md` (Go/Gin on `:3000`, routes under
`/dev-api`). This ADR records the four decisions that shape the implementation.

## 1. The renderer never speaks HTTP to the account service

The service answers `Access-Control-Allow-Origin: *` together with
`Access-Control-Allow-Credentials: true`. The browser specification forbids that
combination from carrying credentials, and this app's renderer origin is
`file://` when packaged and a Vite origin in development — both cross-origin to
`localhost:3000`. A renderer-side `fetch` could therefore never receive or send
the `GUANYU_REMEMBER` cookie, which is the entire basis of "remember me".

The main process owns the HTTP conversation instead, following the document's
"non-browser client" path (§5.3): it sends the long-lived credential as an
explicit `Cookie` header and reads the rotated value back from `Set-Cookie`.
Five IPC channels carry the conversation (`accountCaptchaGet`, `accountSignIn`,
`accountSignOut`, `accountStateGet`, `accountProfileRefresh`) plus one event
(`accountChanged`). The base URL is `http://localhost:3000/dev-api`, overridable
with `PI_DESKTOP_ACCOUNT_BASE_URL` for staging; production must point it at an
HTTPS origin, because the service's `Secure` cookies are dropped over plain HTTP
to anything but localhost.

Consequence: `AccountState` carries identity and an expiry, never a token, a
cookie, or a password. The password travels renderer → main exactly once, on
sign-in, and the sign-in surface clears its copy the moment the call settles.

## 2. Credentials live in `<dataDir>/account.json`, encrypted

The session token and the long-lived credential are `safeStorage` ciphertext in
one file, written tmp+rename at mode `0600`, in the same shape
`remote/remote-host-registry.ts` already uses for paired-host device tokens. The
identity (username, profile, expiry) is in clear so a launch can paint the
account row without decrypting anything.

A Linux session without a keyring has no `safeStorage`. Refusing to remember the
account there would silently drop the user back to the sign-in form on every
launch, so the store degrades to a plaintext `0600` file plus one warning, and
records `unencrypted: true` in the file so a later launch with a keychain can
tell the difference.

## 3. Session expiry has two paths, and both are silent until they are not

- **Remembered.** Past `expiresAt`, `restore()` sends a credential-only
  `getInfo` — no `Authorization`, which is exactly what triggers the service's
  automatic sign-in (§3.3) — adopts the rotated session, and persists the new
  credential before it returns. A window focus or the renewal timer (five
  minutes before expiry) triggers the same path, so a session that lapses while
  the app sits open renews instead of dying.
- **Not remembered.** Nothing to restore with: the gate closes and the user
  signs in again. This is the "会话过期需要重新登录" requirement.

Four constraints from the document are enforced in `account/service.ts` and
asserted by `test/account-service.test.mjs`:

- §6.4 — concurrent credential-less requests are forbidden (the first rotates
  the credential; a second past the 60-second grace period is judged theft and
  revokes the account on every device). `restore()` is single-flight.
- §6.3 — the rotated credential is persisted immediately, inside `adopt()`.
- §6.6 — signing in as a different account revokes the previous account's
  credential first, with an explicit `Authorization`.
- §3.2 — sign-out calls `rememberDisable` with an explicit `Authorization`
  before `logout`; without it the middleware would auto-login the call and
  revoke nothing.

A failed restore distinguishes a *verdict* on the credential (`SESSION_EXPIRED`,
`AUTH_REJECTED` — clear the record) from a *failure to reach the service*
(anything else — keep the record, close the gate for this launch). Clearing on a
transient outage would cost the user a passwordless return for nothing.

## 4. The sign-in surface follows the resolved system theme

The surface is a port of the approved design (two-pane glass window over an
aurora field). Its palette follows the app's resolved theme: light paints the
design's "sunlight" field, dark its "night plum" field. First paint resolves
from `prefers-color-scheme` in `main.tsx` rather than a hardcoded palette, and a
`MutationObserver` on `data-theme` re-resolves the field when the OS appearance
changes while the gate is open.

All paint resolves through `--ds-login-*` tokens. The palette a theme may move
(base, aurora stops, ink, tint, edge, primary, danger) is defined on both theme
roots in `tokens.css`; the derived glass layers are formulas over those tokens,
declared once on `:root`, so they follow whichever palette is active without
re-declaration. `scripts/check-style-tokens.mjs` rejects literal colours and
typography in the surface, and `test/login-screen-theme.test.mjs` pins the
token placement.

Two design elements became real desktop behaviour: the drawn traffic lights and
minimize button drive `api.windowControl`, and on macOS the native traffic
lights are hidden while the gate is closed (`applyAccountWindowChrome`) so the
two do not double up. The aurora field dots remain decorative pickers for the
light field; a hand-picked field wins over the palette default until the next
launch.

## Not included, deliberately

- The service's profile write routes (`PUT /system/user/profile` and
  `.../updatePwd`) panic their handler with no HTTP response (document §3.4).
  The Settings account row is read-only plus sign-out; neither route is called.
- Changelog entries: this is an internal integration, not a released-surface
  change note.
- A renderer-side 401 retry loop: the document states the client needs none, and
  the renewal/probe paths above cover the cases it would have handled.
