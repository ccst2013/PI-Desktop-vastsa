/**
 * The outermost sign-in gate.
 *
 * When no account is active this replaces the whole shell — sidebar, chat, work
 * panel, settings — so the app's own navigation cannot route around it. The
 * surface is a port of the approved design; everything the design simulated is
 * real here:
 *
 * - The challenge is the service's own single-use PNG, not a local canvas. The
 *   ticket is consumed by the next sign-in whatever its outcome, so every
 *   failure fetches a fresh one instead of retrying the spent ticket.
 * - The drawn traffic lights and the minimize button drive the real window.
 * - The service indicator reflects whether the account service answered.
 *
 * The password lives only in this component's state and is cleared the moment
 * the sign-in settles; it never reaches the store.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ACCOUNT_CAPTCHA_LENGTH,
  accountErrorCodeOf,
  accountErrorKey,
  isAccountInputError,
  validateAccountInput,
  type AccountCaptcha,
  type AccountState,
} from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { LoginBrandPane } from "./login/LoginBrandPane";
import { LoginCheckMark, LoginIcon } from "./login/LoginIcons";

type FieldErrors = {
  account?: string;
  password?: string;
  captcha?: string;
};

/**
 * How long the success phase holds before the gate opens. Matches the progress
 * bar's own duration, so the bar completes as the shell takes over.
 */
const SUCCESS_AUTO_ENTER_MS = 1600;

function readClock(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** The design addresses a signed-in person by the local part of their account. */
function displayAccount(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
}

export function LoginScreen() {
  const { t } = useTranslation();
  const applyAccountState = useAppStore((s) => s.applyAccountState);

  const [phase, setPhase] = useState<"form" | "success">("form");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  /** A service-level fault, kept apart from the per-field errors. */
  const [serviceErrorKey, setServiceErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [clock, setClock] = useState(readClock);
  const [captcha, setCaptcha] = useState<AccountCaptcha | null>(null);
  const [captchaInput, setCaptchaInput] = useState("");
  /** Whether the challenge is still in flight; the field never blanks out. */
  const [captchaLoading, setCaptchaLoading] = useState(true);
  /** Whether the last challenge fetch failed; drives the service indicator. */
  const [serviceReachable, setServiceReachable] = useState(true);

  const accountRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  /** The accepted sign-in, held back for the success beat. */
  const pendingState = useRef<AccountState | null>(null);

  const say = useCallback((text: string, error = false) => {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (enterTimer.current) clearTimeout(enterTimer.current);
    };
  }, []);

  /* Status-bar clock, as the design paints it. */
  useEffect(() => {
    const tick = setInterval(() => setClock(readClock()), 1000);
    return () => clearInterval(tick);
  }, []);

  /**
   * Fetch a fresh challenge.
   *
   * The ticket is single-use: the service consumes it on the next sign-in
   * attempt whether that attempt succeeds or not, so this is the only correct
   * response to any failure, and to the user asking for another image.
   */
  const fetchCaptcha = useCallback(
    async (options: { clearInput?: boolean; focus?: boolean } = {}) => {
      setCaptchaLoading(true);
      try {
        const next = await api.getAccountCaptcha();
        if (!mounted.current) return;
        setServiceReachable(true);
        setCaptcha(next);
        if (options.clearInput) setCaptchaInput("");
        setErrors((previous) => {
          if (!previous.captcha) return previous;
          const { captcha: _dropped, ...rest } = previous;
          return rest;
        });
        if (options.focus) captchaRef.current?.focus();
      } catch {
        if (!mounted.current) return;
        // The field stays on screen with its own retry affordance: dropping it
        // would hand the user a form that is silently missing a required input.
        setServiceReachable(false);
        setCaptcha(null);
      } finally {
        if (mounted.current) setCaptchaLoading(false);
      }
    },
    [],
  );

  /* First paint: one challenge, and the account field takes focus once the
     window animation has settled. */
  useEffect(() => {
    void fetchCaptcha();
    const focusTimer = setTimeout(() => accountRef.current?.focus(), 420);
    return () => clearTimeout(focusTimer);
  }, [fetchCaptcha]);

  /** Open the gate. The store moves the shell to the chat page. */
  const enterWorkspace = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    const state = pendingState.current;
    pendingState.current = null;
    if (state) applyAccountState(state);
  }, [applyAccountState]);

  const submit = useCallback(async () => {
    if (submitting) return;

    // The challenge is required unless the service has said otherwise in a
    // response we actually hold. Reading "not fetched yet" as "not required"
    // would let an unreachable service silently downgrade the sign-in.
    const captchaEnabled = captcha?.captchaEnabled ?? true;
    if (captchaEnabled && !captcha) {
      setServiceErrorKey("account.error.captchaUnavailable");
      setShakeKey((key) => key + 1);
      void fetchCaptcha({ clearInput: true });
      return;
    }
    const invalid = validateAccountInput(account, password, captchaInput, captchaEnabled);
    const nextErrors: FieldErrors = {};
    if (
      invalid === "account.error.usernameRequired" ||
      invalid === "account.error.usernameTooLong"
    ) {
      nextErrors.account = invalid;
    } else if (
      invalid === "account.error.passwordRequired" ||
      invalid === "account.error.passwordTooLong"
    ) {
      nextErrors.password = invalid;
    } else if (invalid) {
      nextErrors.captcha = invalid;
    }
    setErrors(nextErrors);
    setServiceErrorKey(null);
    if (Object.keys(nextErrors).length > 0) {
      setShakeKey((key) => key + 1);
      // Land the caret where the problem is, as the design does.
      if (nextErrors.account) accountRef.current?.focus();
      else if (nextErrors.password) passwordRef.current?.focus();
      else captchaRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const state = await api.signIn({
        username: account,
        password,
        code: captchaEnabled ? captchaInput.trim() : "",
        uuid: captchaEnabled ? (captcha?.uuid ?? "") : "",
        rememberMe: remember,
      });
      // The password has served its purpose; drop it before the shell takes
      // over the same renderer process.
      setPassword("");
      setCaptchaInput("");
      if (!mounted.current) return;
      // Hold the accepted state back for the success beat: publishing it now
      // would unmount this surface mid-animation. The timer opens the gate on
      // its own, so the success phase is a beat, not a second click to find.
      pendingState.current = state;
      setPhase("success");
      enterTimer.current = setTimeout(() => {
        if (mounted.current) enterWorkspace();
      }, SUCCESS_AUTO_ENTER_MS);
    } catch (error) {
      if (!mounted.current) return;
      const code = accountErrorCodeOf(error);
      if (isAccountInputError(code)) {
        const key = accountErrorKey(code);
        if (code === "AUTH_CAPTCHA") {
          setErrors({ captcha: key });
          // The ticket is spent either way; a retry would only ever read
          // "wrong answer" again.
          void fetchCaptcha({ clearInput: true, focus: true });
        } else {
          setErrors({ account: key, password: key });
        }
        setShakeKey((current) => current + 1);
      } else {
        setServiceErrorKey(accountErrorKey(code));
        if (code === "AUTH_UNREACHABLE" || code === "AUTH_TIMEOUT") {
          setServiceReachable(false);
        }
        // The challenge may have been consumed by the failed attempt.
        void fetchCaptcha({ clearInput: true });
      }
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }, [account, captcha, captchaInput, enterWorkspace, fetchCaptcha, password, remember, submitting]);

  /* Esc clears the validation errors and the toast, as the status bar promises. */
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setErrors({});
      setServiceErrorKey(null);
      setToast(null);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Enter signs in from anywhere in the window.
   *
   * An input's own Enter is left to the browser: the form's submit handler runs
   * once. Buttons and links keep their native activation. Without that split a
   * keystroke would fire the sign-in twice.
   */
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter" || phase === "success") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT") return;
      event.preventDefault();
      void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, submit]);

  const windowAction = useCallback((action: "close" | "minimize" | "toggleMaximize") => {
    void api.windowControl(action).catch(() => undefined);
  }, []);

  return (
    <main className="login-screen">
      <div
        key={shakeKey}
        className={`login-window ${shakeKey > 0 ? "is-shaking" : ""}`}
      >
        {/* Title bar: a real drag region; the controls opt back out. */}
        <header className="login-titlebar">
          <div className="login-titlebar-controls">
            <button
              type="button"
              className="login-traffic-dot login-traffic-close"
              onClick={() => windowAction("close")}
              aria-label={t("account.windowClose")}
              title={t("account.windowClose")}
            />
            <button
              type="button"
              className="login-traffic-dot login-traffic-minimize"
              onClick={() => windowAction("minimize")}
              aria-label={t("account.windowMinimize")}
              title={t("account.windowMinimize")}
            />
            <button
              type="button"
              className="login-traffic-dot login-traffic-zoom"
              onClick={() => windowAction("toggleMaximize")}
              aria-label={t("account.windowZoom")}
              title={t("account.windowZoom")}
            />
          </div>

          <p className="login-titlebar-title">
            <LoginIcon name="lock" size={14} />
            {t("account.windowTitle")}
          </p>

          <div className="login-titlebar-actions">
            <span className="login-version">{t("account.version")}</span>
            <button
              type="button"
              className="login-titlebar-button"
              onClick={() => say(t("account.helpToast"))}
              aria-label={t("account.help")}
              title={t("account.help")}
            >
              <LoginIcon name="help" size={14} />
            </button>
            <button
              type="button"
              className="login-titlebar-button"
              onClick={() => windowAction("minimize")}
              aria-label={t("account.windowMinimize")}
              title={t("account.windowMinimize")}
            >
              <LoginIcon name="minus" size={14} />
            </button>
          </div>
        </header>

        <div className="login-body">
          <LoginBrandPane
            clock={clock}
            onPrivacy={() => say(t("account.privacyToast"))}
          />

          <section className="login-pane-form">
            <div className="login-form-scroll">
              {phase === "success" ? (
                <div className="login-success">
                  <span className="login-success-shield">
                    <LoginCheckMark />
                  </span>
                  <h2 className="login-success-title">
                    {t("account.successTitle", { name: displayAccount(account) })}
                  </h2>
                  <p className="login-success-body">{t("account.successBody")}</p>
                  <div className="login-progress" aria-hidden="true">
                    <div className="login-progress-bar" />
                  </div>
                  <p className="login-progress-caption">{t("account.successCaption")}</p>
                  <button
                    type="button"
                    className="login-success-back"
                    onClick={() => {
                      if (enterTimer.current) clearTimeout(enterTimer.current);
                      pendingState.current = null;
                      setPhase("form");
                      setPassword("");
                      setErrors({});
                      void fetchCaptcha({ clearInput: true });
                    }}
                  >
                    {t("account.switchAccount")}
                  </button>
                </div>
              ) : (
                <form
                  className="login-form"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void submit();
                  }}
                  noValidate
                >
                  <div className="login-rise-2">
                    <h1 className="login-heading">{t("account.title")}</h1>
                    <p className="login-subheading">{t("account.subtitle")}</p>
                  </div>

                  {serviceErrorKey ? (
                    <p className="login-error-banner" role="status" aria-live="polite">
                      <LoginIcon name="x" size={14} />
                      {t(serviceErrorKey)}
                    </p>
                  ) : null}

                  <div className="login-field-group login-rise-3">
                    <label className="login-field">
                      <span className="login-field-label">{t("account.username")}</span>
                      <span className="login-input-wrap">
                        <span className="login-input-icon">
                          <LoginIcon name="user" size={16} />
                        </span>
                        <input
                          ref={accountRef}
                          className={`login-input ${errors.account ? "is-error" : ""}`}
                          type="text"
                          placeholder={t("account.usernamePlaceholder")}
                          value={account}
                          onChange={(event) => {
                            setAccount(event.target.value);
                            if (errors.account) setErrors((x) => ({ ...x, account: undefined }));
                          }}
                          autoComplete="username"
                          disabled={submitting}
                          aria-invalid={errors.account ? "true" : "false"}
                        />
                      </span>
                      {errors.account ? (
                        <span className="login-field-error" role="alert">
                          <LoginIcon name="x" size={12} />
                          {t(errors.account)}
                        </span>
                      ) : null}
                    </label>

                    <label className="login-field">
                      <span className="login-field-label">{t("account.password")}</span>
                      <span className="login-input-wrap">
                        <span className="login-input-icon">
                          <LoginIcon name="lock" size={16} />
                        </span>
                        <input
                          ref={passwordRef}
                          className={`login-input has-toggle ${errors.password ? "is-error" : ""}`}
                          type={showPassword ? "text" : "password"}
                          placeholder={t("account.passwordPlaceholder")}
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value);
                            if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
                          }}
                          autoComplete="current-password"
                          disabled={submitting}
                          aria-invalid={errors.password ? "true" : "false"}
                        />
                        <button
                          type="button"
                          className="login-password-toggle"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-pressed={showPassword}
                          aria-label={
                            showPassword ? t("account.hidePassword") : t("account.showPassword")
                          }
                        >
                          <LoginIcon name={showPassword ? "eyeOff" : "eye"} size={16} />
                        </button>
                      </span>
                      {errors.password ? (
                        <span className="login-field-error" role="alert">
                          <LoginIcon name="x" size={12} />
                          {t(errors.password)}
                        </span>
                      ) : null}
                    </label>

                    {/* The challenge belongs to the form itself, not to the
                        response: it stays on screen while it loads and when the
                        fetch failed, and only a service that says
                        `captchaEnabled: false` in hand removes it. */}
                    {captcha?.captchaEnabled !== false ? (
                      <div className="login-field">
                        <span className="login-field-label">{t("account.captcha")}</span>
                        <div className="login-captcha-row">
                          <span className="login-input-wrap login-captcha-field">
                            <span className="login-input-icon">
                              <LoginIcon name="key" size={16} />
                            </span>
                            <input
                              ref={captchaRef}
                              className={`login-input is-captcha ${errors.captcha ? "is-error" : ""}`}
                              placeholder={t("account.captchaPlaceholder")}
                              maxLength={ACCOUNT_CAPTCHA_LENGTH}
                              value={captchaInput}
                              onChange={(event) => {
                                setCaptchaInput(event.target.value);
                                if (errors.captcha) setErrors((x) => ({ ...x, captcha: undefined }));
                              }}
                              autoComplete="one-time-code"
                              spellCheck={false}
                              disabled={submitting}
                              aria-invalid={errors.captcha ? "true" : "false"}
                              aria-label={t("account.captcha")}
                            />
                            <span className="login-input-suffix">
                              {t("account.captchaCount", { count: captchaInput.length })}
                            </span>
                          </span>

                          <button
                            type="button"
                            className={`login-captcha ${captcha?.imageDataUrl ? "" : "is-empty"}`}
                            onClick={() => void fetchCaptcha({ clearInput: true })}
                            title={t("account.captchaRefresh")}
                            aria-label={t("account.captchaRefresh")}
                            aria-busy={captchaLoading}
                          >
                            {captcha?.imageDataUrl ? (
                              <img
                                className="login-captcha-image"
                                src={captcha.imageDataUrl}
                                alt={t("account.captchaImageAlt")}
                              />
                            ) : null}
                            {/* With no challenge to show, the box says so and is
                                itself the retry. An empty frame reads as a
                                missing field. */}
                            {captchaLoading ? (
                              <span className="login-captcha-skeleton" aria-hidden="true" />
                            ) : (
                              <span className="login-captcha-empty-text">
                                {t("account.captchaRetry")}
                              </span>
                            )}
                            <span className="login-captcha-overlay">
                              <LoginIcon name="refresh" size={12} />
                              {t("account.captchaRefreshShort")}
                            </span>
                          </button>

                          <button
                            type="button"
                            className="login-captcha-refresh"
                            onClick={() => void fetchCaptcha({ clearInput: true })}
                            title={t("account.captchaRefresh")}
                            aria-label={t("account.captchaRefresh")}
                          >
                            <LoginIcon name="refresh" size={16} />
                          </button>
                        </div>

                        {errors.captcha ? (
                          <p className="login-field-error" role="alert">
                            <LoginIcon name="x" size={12} />
                            {t(errors.captcha)}
                          </p>
                        ) : (
                          <p className="login-field-hint">{t("account.captchaHint")}</p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="login-options-row login-rise-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={remember}
                      className="login-switch"
                      onClick={() => setRemember((value) => !value)}
                      disabled={submitting}
                    >
                      <span className="login-switch-track">
                        <span className="login-switch-knob" />
                      </span>
                      <span className="login-switch-label">{t("account.rememberMe")}</span>
                    </button>
                    <button
                      type="button"
                      className="login-forgot"
                      onClick={() => say(t("account.forgotToast"))}
                    >
                      {t("account.forgotPassword")}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="login-submit login-rise-5"
                    disabled={submitting}
                    aria-busy={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="login-submit-spinner" aria-hidden="true" />
                        {t("account.signingIn")}
                      </>
                    ) : (
                      <>
                        {t("account.signIn")}
                        <LoginIcon name="arrow" size={16} />
                      </>
                    )}
                  </button>

                  <p className="login-demo-note login-rise-6">{t("account.note")}</p>
                </form>
              )}
            </div>

            <footer className="login-statusbar">
              <div className="login-statusbar-keys">
                <span className="login-statusbar-hint">
                  <span className="login-keycap">Enter</span>
                  {t("account.statusbarEnter")}
                </span>
                <span className="login-statusbar-hint">
                  <span className="login-keycap">Esc</span>
                  {t("account.statusbarEsc")}
                </span>
              </div>
              <span className="login-service-state">
                <span
                  className={`login-service-dot ${serviceReachable ? "" : "is-down"}`}
                  aria-hidden="true"
                />
                {serviceReachable ? t("account.serviceOk") : t("account.serviceDown")}
              </span>
            </footer>
          </section>
        </div>
      </div>

      {toast ? (
        <div
          className={`login-toast ${toast.error ? "is-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      ) : null}
    </main>
  );
}
