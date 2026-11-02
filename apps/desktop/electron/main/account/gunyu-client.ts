/**
 * HTTP client for the account service (`/dev-api`).
 *
 * This module deliberately imports nothing from `electron`, so `node --test`
 * can drive it against a local `node:http` fixture the same way
 * `test/user-login-path.test.mjs` drives `user-login-path.ts`.
 *
 * Three properties of the service shape the code below, all of them documented
 * in `docs/remember-me-client-integration.md`:
 *
 * 1. **Responses are flat.** `token`, `expiresIn`, `uuid`, `img`, `user`,
 *    `roles`, and `permissions` sit beside `code` and `msg` — there is no
 *    `data` envelope. Reading `body.data.token` silently yields `undefined`.
 *
 * 2. **HTTP status is always 200.** The verdict lives in the body's `code`, so
 *    a `response.ok` check proves nothing. `401` in the body means the session
 *    lapsed; `500` covers everything from a wrong password to a dead Redis.
 *
 * 3. **The long-lived credential rotates on every automatic sign-in.** The
 *    client must read the new `GUANYU_REMEMBER` off the response and persist it
 *    before the 60-second grace period ends, or the next use of the stale value
 *    is judged theft and revokes the account on every device.
 *
 * Nothing here logs a password, a token, or a cookie value.
 */

/** The service's own base URL. Overridable for staging and for tests. */
export const DEFAULT_ACCOUNT_BASE_URL = "http://localhost:3000/dev-api";

/** Environment override, read once by the boot layer. */
export const ACCOUNT_BASE_URL_ENV = "PI_DESKTOP_ACCOUNT_BASE_URL";

/**
 * Request budget. The service is a local Go process; anything slower than this
 * is a hung dependency, and the sign-in form is waiting on the answer.
 */
export const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000;

/** The long-lived credential's cookie name. HttpOnly in a browser; ours to carry. */
export const REMEMBER_COOKIE_NAME = "GUANYU_REMEMBER";

/** The session token's cookie name, which the middleware also rotates. */
export const ADMIN_TOKEN_COOKIE_NAME = "Admin-Token";

/** A structured log sink. Injected so this module stays Electron-free. */
export type AccountLog = (
  level: "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) => void;

/** One parsed `Set-Cookie` header. */
export type SetCookie = {
  name: string;
  value: string;
  /** True when the service asked for the cookie to be removed. */
  expired: boolean;
  /** The `Max-Age` attribute in seconds, or null when the cookie is session-scoped. */
  maxAgeSeconds: number | null;
};

/** A flat service envelope: `code`/`msg` plus whatever the route returns. */
type Envelope = Record<string, unknown> & { code?: unknown; msg?: unknown };

/** The challenge the sign-in form paints. */
export type CaptchaResult = {
  uuid: string;
  /** Bare base64 PNG exactly as the service sent it. */
  img: string;
  captchaEnabled: boolean;
};

/** A successful `rememberLogin`. */
export type LoginResult = {
  token: string;
  /** Session lifetime in seconds, as the service reported it. */
  expiresIn: number;
  /**
   * Whether the service actually issued the long-lived credential. It degrades
   * to `false` on a database failure while the sign-in itself still succeeds.
   */
  rememberMe: boolean;
  /** The rotated `GUANYU_REMEMBER` value, or null when none was issued. */
  rememberCookie: string | null;
};

/** The `user` object inside `getInfo`, narrowed to what the app displays. */
export type ServiceUser = {
  userId: number;
  userName: string;
  nickName: string;
  email: string | null;
  phonenumber: string | null;
  sex: string | null;
  avatar: string | null;
  deptName: string | null;
  admin: boolean;
};

/** A successful `getInfo`. */
export type InfoResult = {
  user: ServiceUser;
  roles: string[];
  permissions: string[];
  /**
   * A new session token when this call was an automatic sign-in (no
   * `Authorization` sent), because the middleware rebuilds the session and
   * hands the replacement back through the `Admin-Token` cookie.
   */
  rotatedToken: string | null;
  /**
   * Lifetime in seconds of the rebuilt session, read from the `Admin-Token`
   * cookie's `Max-Age`. Null for an authenticated call, which rotates nothing.
   */
  rotatedExpiresIn: number | null;
  /** The rotated long-lived credential, or null when none was issued. */
  rememberCookie: string | null;
};

/**
 * A failure with a stable code.
 *
 * `message` is safe to log and safe to surface in a diagnostic bundle: it never
 * contains the submitted password, a token, or a cookie value. It is also not
 * localized, which is why the renderer maps `code` to a catalog key instead of
 * showing this text.
 *
 * The code is exposed under two names. `errorCode` is what the IPC bridge's
 * `wrap()` reads when it turns a rejection into a `Result`; `code` is what the
 * renderer's `invoke` helper re-attaches, and what `accountErrorCodeOf` reads.
 * Carrying both keeps the code intact across the bridge without teaching the
 * shared error path anything about accounts.
 */
export class AccountServiceError extends Error {
  readonly code: string;
  readonly errorCode: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AccountServiceError";
    this.code = code;
    this.errorCode = code;
  }
}

export type GunyuClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  log?: AccountLog;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
};

/**
 * Read every `Set-Cookie` header off a response.
 *
 * `getSetCookie()` is the only correct way: `headers.get("set-cookie")` joins
 * multiple headers with ", ", which corrupts a value whose `Expires` attribute
 * contains a comma. The fallback exists for a fetch implementation that
 * predates it.
 */
export function readSetCookies(response: Response): SetCookie[] {
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (() => {
          const joined = response.headers.get("set-cookie");
          return joined ? [joined] : [];
        })();

  const out: SetCookie[] = [];
  for (const header of raw) {
    const [pair, ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name) continue;
    // `Max-Age=-1` (or any non-positive value) is the service's way of asking
    // for the cookie to be dropped; an empty value means the same.
    const maxAge = attributes
      .map((attribute) => attribute.trim())
      .find((attribute) => /^max-age=/i.test(attribute))
      ?.slice("max-age=".length);
    const maxAgeSeconds =
      maxAge !== undefined && Number.isFinite(Number(maxAge)) ? Number(maxAge) : null;
    const expired = value.length === 0 || (maxAgeSeconds !== null && maxAgeSeconds <= 0);
    out.push({ name, value, expired, maxAgeSeconds });
  }
  return out;
}

/** The `GUANYU_REMEMBER` value a response carries, or null when it carries none. */
export function rememberCookieFrom(response: Response): string | null {
  for (const cookie of readSetCookies(response)) {
    if (cookie.name !== REMEMBER_COOKIE_NAME) continue;
    // An explicit clear is not a rotation; the caller must drop its copy.
    return cookie.expired ? null : cookie.value;
  }
  return null;
}

/**
 * The `Admin-Token` cookie a response carries, or null when it carries none.
 *
 * Returned whole rather than as a bare value because its `Max-Age` is the only
 * place the rebuilt session's lifetime is reported: an automatic sign-in has no
 * response body field for it.
 */
export function adminTokenCookieFrom(response: Response): SetCookie | null {
  for (const cookie of readSetCookies(response)) {
    if (cookie.name !== ADMIN_TOKEN_COOKIE_NAME) continue;
    return cookie.expired ? null : cookie;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Classify a body-level failure.
 *
 * The service reports a wrong password, a disabled account, and a dead Redis
 * all as `code: 500`, distinguished only by `msg`. The split matters: the first
 * two are the user's input and belong beside a field, the third is not and must
 * not tell the user to retype a password that was fine.
 *
 * The matched text is never carried into the error message — it is not
 * localized, and a failing endpoint can echo the submitted payload back.
 */
export function classifyBodyFailure(code: number, msg: string): string {
  if (code === 401) return "SESSION_EXPIRED";
  if (code === 400) return "AUTH_CLIENT";
  if (msg.includes("验证码")) return "AUTH_CAPTCHA";
  if (msg.includes("密码错误") || msg.includes("用户不存在") || msg.includes("被禁用")) {
    return "AUTH_REJECTED";
  }
  return "AUTH_SERVICE_ERROR";
}

/**
 * Strip anything credential-shaped out of a transport error's text.
 *
 * A proxy or TLS failure can embed the full URL and the request body, so the
 * message is reduced to its error class before it is logged or thrown.
 */
function transportMessage(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "TransportError";
}

function isTimeout(error: unknown): boolean {
  return (
    (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) ||
    (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "UND_ERR_HEADERS_TIMEOUT")
  );
}

export interface GunyuClient {
  readonly baseUrl: string;
  /** `GET /captchaImage` — a fresh single-use challenge. */
  captcha(): Promise<CaptchaResult>;
  /** `POST /rememberLogin` — exchange credentials for a session. */
  login(input: {
    username: string;
    password: string;
    code: string;
    uuid: string;
    rememberMe: boolean;
  }): Promise<LoginResult>;
  /**
   * `GET /getInfo` — the signed-in user, roles, and permissions.
   *
   * Pass `token` for a normal authenticated read. Pass only `rememberCookie`
   * to trigger the service's automatic sign-in: the middleware sees no
   * `Authorization`, validates the long-lived credential, rebuilds the session,
   * and answers with the business data plus a rotated credential.
   */
  info(input: { token?: string | null; rememberCookie?: string | null }): Promise<InfoResult>;
  /** `POST /rememberDisable` — revoke the long-lived credential. */
  disableRemember(input: { token: string; allDevices?: boolean }): Promise<void>;
  /** `POST /logout` — end the session. Does not revoke the long-lived credential. */
  logout(input: { token: string }): Promise<void>;
}

export function createGunyuClient(options: GunyuClientOptions = {}): GunyuClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_ACCOUNT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? ACCOUNT_REQUEST_TIMEOUT_MS;
  const log = options.log ?? (() => undefined);
  const doFetch = options.fetchImpl ?? fetch;

  /**
   * One request, with the flat envelope unwrapped and its `code` checked.
   *
   * Every failure path throws `AccountServiceError` with a stable code, and no
   * message or log line carries the submitted password, a token, or a cookie
   * value.
   */
  const request = async (
    path: string,
    init: {
      method?: "GET" | "POST";
      body?: unknown;
      token?: string | null;
      cookie?: string | null;
      /** True when a body-level failure is expected and should not be logged as an error. */
      expectedFailure?: boolean;
    } = {},
  ): Promise<{ envelope: Envelope; response: Response }> => {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    // Sent explicitly rather than left to a cookie jar: this is the
    // "non-browser client" path, and the renderer never holds this value.
    if (init.cookie) headers.Cookie = `${REMEMBER_COOKIE_NAME}=${init.cookie}`;

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        // Manual so a redirect cannot carry the Authorization header to a
        // different origin.
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) {
        log("warn", "account request timed out", { path, timeoutMs });
        throw new AccountServiceError("AUTH_TIMEOUT", `the account service did not answer within ${timeoutMs}ms`);
      }
      log("warn", "account request transport failed", { path, cause: transportMessage(error) });
      throw new AccountServiceError("AUTH_UNREACHABLE", "the account service could not be reached");
    }

    // A 3xx is not followed: the credential must not travel to wherever the
    // service points, and a login page behind a proxy answers this way.
    if (response.status >= 300 && response.status < 400) {
      log("warn", "account request redirected", { path, status: response.status });
      throw new AccountServiceError("AUTH_UNREACHABLE", "the account service redirected the request");
    }

    const raw = await response.text().catch(() => "");
    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      log("error", "account response was not JSON", { path, status: response.status });
      throw new AccountServiceError("AUTH_MALFORMED", "the account service returned a response this client cannot read");
    }

    const code = typeof envelope.code === "number" ? envelope.code : Number.NaN;
    if (!Number.isFinite(code)) {
      log("error", "account response had no code", { path, status: response.status });
      throw new AccountServiceError("AUTH_MALFORMED", "the account service returned a response this client cannot read");
    }

    if (code !== 200) {
      const msg = typeof envelope.msg === "string" ? envelope.msg : "";
      const errorCode = classifyBodyFailure(code, msg);
      // A refused password is an ordinary outcome, not a fault worth an error
      // line; the transport and shape failures above already logged themselves.
      if (!init.expectedFailure) {
        log("warn", "account request refused", { path, code: errorCode, bodyCode: code });
      }
      throw new AccountServiceError(errorCode, `the account service refused the request (${errorCode})`);
    }

    return { envelope, response };
  };

  return {
    baseUrl,

    async captcha() {
      const { envelope } = await request("/captchaImage");
      const uuid = text(envelope.uuid);
      const img = text(envelope.img);
      if (!uuid) {
        throw new AccountServiceError("AUTH_MALFORMED", "the account service returned a challenge without a ticket");
      }
      return {
        uuid,
        // `img` may legitimately be absent when the deployment turned the
        // challenge off; the caller hides the field on `captchaEnabled`.
        img: img ?? "",
        captchaEnabled: envelope.captchaEnabled !== false,
      };
    },

    async login({ username, password, code, uuid, rememberMe }) {
      const { envelope, response } = await request("/rememberLogin", {
        method: "POST",
        body: { username, password, code, uuid, rememberMe },
        expectedFailure: true,
      });
      const token = text(envelope.token);
      if (!token) {
        throw new AccountServiceError("AUTH_MALFORMED", "the account service accepted the sign-in without a token");
      }
      const rawExpires = envelope.expiresIn;
      const expiresIn =
        typeof rawExpires === "number" && Number.isFinite(rawExpires) && rawExpires > 0 ? rawExpires : 0;
      return {
        token,
        expiresIn,
        // Read the service's answer, not the checkbox: issuance degrades
        // silently to false while the sign-in still succeeds.
        rememberMe: envelope.rememberMe === true,
        rememberCookie: rememberCookieFrom(response),
      };
    },

    async info({ token, rememberCookie }) {
      const { envelope, response } = await request("/getInfo", {
        token: token ?? null,
        cookie: token ? null : (rememberCookie ?? null),
      });
      const user = envelope.user;
      if (!user || typeof user !== "object") {
        throw new AccountServiceError("AUTH_MALFORMED", "the account service returned no user");
      }
      const record = user as Record<string, unknown>;
      const userName = text(record.userName);
      if (!userName) {
        throw new AccountServiceError("AUTH_MALFORMED", "the account service returned a user without a name");
      }
      const dept = record.dept;
      // Read once: an authenticated call never rotates, so there is no cookie to
      // look for and the caller must not mistake an absent one for a new session.
      const adminToken = token ? null : adminTokenCookieFrom(response);
      return {
        user: {
          userId: typeof record.userId === "number" ? record.userId : Number.NaN,
          userName,
          nickName: text(record.nickName) ?? userName,
          email: text(record.email),
          phonenumber: text(record.phonenumber),
          sex: text(record.sex),
          avatar: text(record.avatar),
          deptName:
            dept && typeof dept === "object" ? text((dept as Record<string, unknown>).deptName) : null,
          admin: record.admin === true,
        },
        roles: stringArray(envelope.roles),
        permissions: stringArray(envelope.permissions),
        // Only an automatic sign-in rotates the session, and it hands the
        // replacement back through the non-HttpOnly `Admin-Token` cookie, whose
        // `Max-Age` is the rebuilt session's lifetime.
        rotatedToken: adminToken?.value ?? null,
        rotatedExpiresIn: adminToken?.maxAgeSeconds ?? null,
        rememberCookie: rememberCookieFrom(response),
      };
    },

    async disableRemember({ token, allDevices }) {
      await request("/rememberDisable", {
        method: "POST",
        token,
        body: { allDevices: allDevices === true },
        expectedFailure: true,
      });
    },

    async logout({ token }) {
      await request("/logout", { method: "POST", token, expectedFailure: true });
    },
  };
}
