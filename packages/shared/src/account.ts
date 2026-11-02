/**
 * Account contract, shared by the main process, the preload bridge, and the
 * renderer.
 *
 * Sign-in is the outermost gate: the renderer resolves who is signed in before
 * it mounts the application shell, so none of the app's own navigation can
 * route around it.
 *
 * Two rules shape every type below.
 *
 * 1. **The renderer never speaks HTTP to the account service.** The backend
 *    answers `Access-Control-Allow-Origin: *` together with
 *    `Access-Control-Allow-Credentials: true`, a combination the browser
 *    forbids credentials under, and this app's renderer origin is `file://`
 *    when packaged. The long-lived `GUANYU_REMEMBER` credential therefore only
 *    ever exists in the main process, which sends it as an explicit `Cookie`
 *    header and reads the rotated value back from `Set-Cookie` — the
 *    "non-browser client" path the integration document describes.
 *
 * 2. **No credential crosses back to the renderer.** `AccountState` carries
 *    identity and an expiry, never a token, a cookie, or a password. The
 *    password travels renderer -> main exactly once, on sign-in.
 */

/**
 * The signed-in user as the renderer may display it.
 *
 * Field names follow the service's own `getInfo` payload so the mapping in the
 * main process is a straight copy rather than a translation. `sex` stays the
 * service's string code (`"0"`/`"1"`/`"2"`) because nothing here renders it.
 */
export interface AccountProfile {
  userId: number;
  userName: string;
  nickName: string;
  email: string | null;
  phonenumber: string | null;
  sex: string | null;
  avatar: string | null;
  /** Department display name, null when the service omits the department. */
  deptName: string | null;
  /** The service's own `user.admin`, computed from `userId === 1`. */
  admin: boolean;
  /** Role keys, e.g. `["admin"]`. */
  roles: string[];
  /** Permission strings; `["*:*:*"]` for a super administrator. */
  permissions: string[];
}

/** The signed-in account as the renderer sees it. Never carries a credential. */
export interface AccountState {
  signedIn: boolean;
  /** The submitted username, echoed back once the service accepts it. */
  username: string | null;
  /** A human label for the account: the nickname when the service gives one. */
  displayName: string | null;
  /**
   * Whether the service actually issued a 30-day credential.
   *
   * Read from the sign-in response rather than from the checkbox: issuance
   * degrades silently to `false` on a database failure while the sign-in
   * itself still succeeds, and the UI must not promise a passwordless return
   * that will not happen.
   */
  rememberMe: boolean;
  /**
   * Unix seconds at which the session token lapses, or null when the service
   * did not report one. Past this instant the main process tries the
   * long-lived credential before it asks the user to sign in again.
   */
  expiresAt: number | null;
  profile: AccountProfile | null;
}

/** The signed-out state every surface starts from. */
export const SIGNED_OUT_ACCOUNT_STATE: AccountState = {
  signedIn: false,
  username: null,
  displayName: null,
  rememberMe: false,
  expiresAt: null,
  profile: null,
};

/**
 * A graphical challenge, as the renderer paints it.
 *
 * `imageDataUrl` already carries the `data:image/png;base64,` prefix: the
 * service returns bare base64 and expects the client to add it, and doing that
 * in one place keeps the component from having to know.
 */
export interface AccountCaptcha {
  /** Opaque single-use ticket. 20 alphanumeric characters; never parse it. */
  uuid: string;
  imageDataUrl: string;
  /**
   * Whether the service will check the answer at all. When false the form
   * hides the field and sign-in succeeds without one.
   */
  captchaEnabled: boolean;
}

/** What the sign-in form submits. */
export interface AccountSignInInput {
  username: string;
  password: string;
  /** Empty when `captchaEnabled` was false. */
  code: string;
  /** Empty when `captchaEnabled` was false. */
  uuid: string;
  rememberMe: boolean;
}

/**
 * Stable error codes the account service returns.
 *
 * The service's own rejection text is deliberately not propagated: it is not
 * localized for the user, and a failing endpoint can echo the submitted
 * payload back.
 */
export type AccountErrorCode =
  /** The submitted credentials were refused. */
  | "AUTH_REJECTED"
  /** The graphical challenge answer did not match, or the ticket was spent. */
  | "AUTH_CAPTCHA"
  /** The service could not be reached at all. */
  | "AUTH_UNREACHABLE"
  | "AUTH_TIMEOUT"
  /** The service answered with a failure that is not the user's input. */
  | "AUTH_SERVICE_ERROR"
  /** The service answered with a shape this client does not understand. */
  | "AUTH_MALFORMED"
  /** The submitted request itself was invalid. */
  | "AUTH_CLIENT"
  /** The local credential store could not be read or written. */
  | "ACCOUNT_STORE"
  /** The session lapsed and no long-lived credential could restore it. */
  | "SESSION_EXPIRED";

/**
 * Input bounds. Mirrored in the main process, which re-validates: these exist
 * so the form answers immediately, not to be the boundary.
 */
export const ACCOUNT_USERNAME_MAX_LENGTH = 128;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 256;

/**
 * The challenge is four digits, so four characters is both the exact length
 * and the input's `maxLength`.
 */
export const ACCOUNT_CAPTCHA_LENGTH = 4;

/**
 * Check the form before the request leaves the renderer. Returns the
 * localization key of the first problem, or null when the input is acceptable.
 *
 * The challenge is only required when the service asked for one; a deployment
 * with `sys.account.captchaEnabled` off would otherwise be impossible to sign
 * into.
 */
export function validateAccountInput(
  username: string,
  password: string,
  code: string,
  captchaEnabled: boolean,
): string | null {
  const trimmed = username.trim();
  if (trimmed.length === 0) return "account.error.usernameRequired";
  if (trimmed.length > ACCOUNT_USERNAME_MAX_LENGTH) {
    return "account.error.usernameTooLong";
  }
  if (password.length === 0) return "account.error.passwordRequired";
  if (password.length > ACCOUNT_PASSWORD_MAX_LENGTH) {
    return "account.error.passwordTooLong";
  }
  if (captchaEnabled) {
    const answer = code.trim();
    if (answer.length === 0) return "account.error.captchaRequired";
    if (answer.length !== ACCOUNT_CAPTCHA_LENGTH) {
      return "account.error.captchaWrong";
    }
  }
  return null;
}

/**
 * Localization key for a sign-in failure.
 *
 * Only `AUTH_REJECTED` and `AUTH_CAPTCHA` mean the submitted input was
 * refused; every other code means the request never reached a working service.
 * Blaming the input for those would tell the user to retype a password that
 * was fine.
 */
export function accountErrorKey(code: string | undefined): string {
  switch (code) {
    case "AUTH_REJECTED":
      return "account.error.rejected";
    case "AUTH_CAPTCHA":
      return "account.error.captchaWrong";
    case "AUTH_UNREACHABLE":
      return "account.error.unreachable";
    case "AUTH_TIMEOUT":
      return "account.error.timeout";
    case "AUTH_SERVICE_ERROR":
      return "account.error.service";
    case "AUTH_MALFORMED":
      return "account.error.malformed";
    case "AUTH_CLIENT":
      return "account.error.client";
    case "ACCOUNT_STORE":
      return "account.error.storage";
    case "SESSION_EXPIRED":
      return "account.error.expired";
    default:
      return "account.error.failed";
  }
}

/**
 * Whether a failure is about what the user typed.
 *
 * Drives where the form paints the message: an input fault belongs beside the
 * field it faults, while a service fault belongs above the form so it cannot
 * read as "your password is wrong".
 */
export function isAccountInputError(code: string | undefined): boolean {
  return code === "AUTH_REJECTED" || code === "AUTH_CAPTCHA";
}

/**
 * Read the account code off an error the bridge threw.
 *
 * The main process rejects with an `AppError`-shaped payload, but a thrown
 * string or a plain `Error` has to land somewhere too, so anything
 * unrecognized becomes `AUTH_CLIENT` rather than an empty code.
 */
export function accountErrorCodeOf(error: unknown): AccountErrorCode | string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "AUTH_CLIENT";
}

/**
 * A session that has lapsed but may still be restorable.
 *
 * The main process compares `expiresAt` against the clock before it decides
 * whether to try the long-lived credential; this is the same test the renderer
 * uses to phrase the expiry row in Settings.
 */
export function accountSessionExpired(
  state: Pick<AccountState, "signedIn" | "expiresAt">,
  nowSeconds: number,
): boolean {
  if (!state.signedIn) return true;
  if (state.expiresAt === null) return false;
  return state.expiresAt <= nowSeconds;
}
