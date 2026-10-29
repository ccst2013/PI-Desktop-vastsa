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
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
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
import {
  defaultAuroraField,
  LoginBrandPane,
  resolvedThemeFromDocument,
  type AuroraField,
} from "./login/LoginBrandPane";
import { LoginIcon } from "./login/LoginIcons";

type FieldErrors = {
  account?: string;
  password?: string;
  captcha?: string;
};

/** How long the success phase holds before the gate opens on its own. */
const SUCCESS_AUTO_ENTER_MS = 1200;

function readClock(): string {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function LoginScreen() {
  const { t } = useTranslation();
  const applyAccountState = useAppStore((s) => s.applyAccountState);

  const [phase, setPhase] = useState<"form" | "success">("form");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  /** A service-level fault, kept apart from the per-field errors. */
  const [serviceErrorKey, setServiceErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [clock, setClock] = useState(readClock);
  const [field, setField] = useState<AuroraField>(() =>
    defaultAuroraField(resolvedThemeFromDocument()),
  );
  const [captcha, setCaptcha] = useState<AccountCaptcha | null>(null);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaNonce, setCaptchaNonce] = useState(0);
  /** Whether the last challenge fetch failed; drives the service indicator. */
  const [serviceReachable, setServiceReachable] = useState(true);

  const accountRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  /** A field the user picked by hand wins over the palette default. */
  const fieldPickedByUser = useRef(false);
  /** The accepted sign-in, held back for the success beat. */
  const pendingState = useRef<AccountState | null>(null);

  const say = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
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

  /* Follow the resolved theme: switching the OS appearance while the gate is
     open moves the field between the design's light and dark defaults, unless
     the user has picked a field by hand. */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (fieldPickedByUser.current) return;
      setField(defaultAuroraField(resolvedThemeFromDocument()));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
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
      try {
        const next = await api.getAccountCaptcha();
        if (!mounted.current) return;
        setServiceReachable(true);
        setCaptcha(next);
        setCaptchaNonce((nonce) => nonce + 1);
        if (options.clearInput) setCaptchaInput("");
        setErrors((previous) => {
          if (!previous.captcha) return previous;
          const { captcha: _dropped, ...rest } = previous;
          return rest;
        });
        if (options.focus) captchaRef.current?.focus();
      } catch {
        if (!mounted.current) return;
        setServiceReachable(false);
        setCaptcha(null);
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

  /** Open the gate. The store moves the shell to the chat page. */
  const enterWorkspace = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    const state = pendingState.current;
    pendingState.current = null;
    if (state) applyAccountState(state);
  }, [applyAccountState]);

  const onCapsKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.getModifierState) setCapsOn(event.getModifierState("CapsLock"));
  };

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;

      const captchaEnabled = captcha?.captchaEnabled ?? false;
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
        // would unmount this surface mid-animation. The timer below opens the
        // gate on its own, so the success phase is a beat, not a second click
        // the user has to find.
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
            setAttempts((count) => count + 1);
            // The ticket is spent either way; a retry would only ever read
            // "wrong answer" again.
            void fetchCaptcha({ clearInput: true, focus: true });
          } else {
            setErrors({ account: key, password: key });
          }
          setShakeKey((key2) => key2 + 1);
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
    },
    [account, captcha, captchaInput, enterWorkspace, fetchCaptcha, password, remember, submitting],
  );

  const windowAction = useCallback((action: "close" | "minimize" | "toggleMaximize") => {
    void api.windowControl(action).catch(() => undefined);
  }, []);

  const fieldStyle = {
    "--ds-login-aurora-1": field.a,
    "--ds-login-aurora-2": field.b,
    "--ds-login-aurora-3": field.c,
    "--ds-login-aurora-glow": field.glow,
    "--ds-login-ink": field.ink,
    "--ds-login-base": field.base,
    "--ds-login-glass-tint": String(field.glassTint),
    "--ds-login-glass-edge": String(field.glassEdge),
  } as CSSProperties;

  return (
    <main className="login-screen" style={fieldStyle}>
      <div className="login-aurora" aria-hidden="true">
        <div className="login-blob login-blob-1" />
        <div className="login-blob login-blob-2" />
        <div className="login-blob login-blob-3" />
      </div>
      <div className="login-grain" aria-hidden="true" />
      <div className="login-shard login-shard-a" aria-hidden="true" />
      <div className="login-shard login-shard-b" aria-hidden="true" />
      <div className="login-shard login-shard-c" aria-hidden="true" />

      <div className="login-window">
        {/* Title bar: a real drag region; the controls opt back out. */}
        <div className="login-titlebar">
          <div className="login-titlebar-controls">
            <button
              type="button"
              className="login-traffic-dot login-traffic-close"
              onClick={() => windowAction("close")}
              aria-label={t("account.windowClose")}
            />
            <button
              type="button"
              className="login-traffic-dot login-traffic-minimize"
              onClick={() => windowAction("minimize")}
              aria-label={t("account.windowMinimize")}
            />
            <button
              type="button"
              className="login-traffic-dot login-traffic-zoom"
              onClick={() => windowAction("toggleMaximize")}
              aria-label={t("account.windowZoom")}
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
            >
              <LoginIcon name="help" size={14} />
            </button>
            <button
              type="button"
              className="login-titlebar-button"
              onClick={() => windowAction("minimize")}
              aria-label={t("account.windowMinimize")}
            >
              <LoginIcon name="minus" size={14} />
            </button>
          </div>
        </div>

        <div className="login-body">
          <LoginBrandPane
            field={field}
            onField={(next) => {
              if (next.id === field.id) return;
              fieldPickedByUser.current = true;
              setField(next);
              say(t("account.themeSwitched", { name: t(next.nameKey) }));
            }}
            clock={clock}
            onTerms={() => say(t("account.termsToast"))}
            onPrivacy={() => say(t("account.privacyToast"))}
          />

          <div className="login-pane-form">
            {phase === "form" ? (
              <div
                key={shakeKey}
                className={`login-form-wrap ${shakeKey > 0 ? "is-shaking" : "is-rising"}`}
              >
                <h1 className="login-heading">{t("account.title")}</h1>
                <p className="login-subheading">{t("account.subtitle")}</p>

                {serviceErrorKey ? (
                  <p className="login-service-error" role="status" aria-live="polite">
                    <LoginIcon name="warn" size={14} />
                    {t(serviceErrorKey)}
                  </p>
                ) : null}

                <form className="login-form" onSubmit={submit} noValidate>
                  <label className="login-field-block">
                    <span className="login-field-label">{t("account.username")}</span>
                    <span className={`login-field ${errors.account ? "has-error" : ""}`}>
                      <LoginIcon name="user" size={16} className="login-field-icon" />
                      <input
                        ref={accountRef}
                        className="login-input"
                        type="text"
                        placeholder={t("account.usernamePlaceholder")}
                        value={account}
                        onChange={(event) => setAccount(event.target.value)}
                        autoComplete="username"
                        disabled={submitting}
                        aria-invalid={errors.account ? "true" : "false"}
                      />
                    </span>
                    {errors.account ? (
                      <span className="login-field-error" role="alert">
                        <LoginIcon name="warn" size={12} />
                        {t(errors.account)}
                      </span>
                    ) : null}
                  </label>

                  <label className="login-field-block">
                    <span className="login-field-label">{t("account.password")}</span>
                    <span className={`login-field ${errors.password ? "has-error" : ""}`}>
                      <LoginIcon name="lock" size={16} className="login-field-icon" />
                      <input
                        className="login-input"
                        type={showPassword ? "text" : "password"}
                        placeholder={t("account.passwordPlaceholder")}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onKeyDown={onCapsKey}
                        onKeyUp={onCapsKey}
                        onBlur={() => setCapsOn(false)}
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
                        <LoginIcon name="warn" size={12} />
                        {t(errors.password)}
                      </span>
                    ) : null}
                  </label>

                  {capsOn ? (
                    <p className="login-caps-warning">
                      <LoginIcon name="warn" size={12} />
                      {t("account.capsLockOn")}
                    </p>
                  ) : null}

                  {captcha?.captchaEnabled ? (
                    <div>
                      <span className="login-field-label">{t("account.captcha")}</span>
                      <div className="login-captcha-row">
                        <span
                          className={`login-field login-captcha-field ${errors.captcha ? "has-error" : ""}`}
                        >
                          <LoginIcon name="key" size={16} className="login-field-icon" />
                          <input
                            ref={captchaRef}
                            className="login-input is-captcha"
                            placeholder={t("account.captchaPlaceholder")}
                            maxLength={ACCOUNT_CAPTCHA_LENGTH}
                            value={captchaInput}
                            onChange={(event) =>
                              setCaptchaInput(
                                event.target.value
                                  .replace(/[^0-9]/g, "")
                                  .slice(0, ACCOUNT_CAPTCHA_LENGTH),
                              )
                            }
                            autoComplete="off"
                            spellCheck={false}
                            inputMode="numeric"
                            disabled={submitting}
                            aria-invalid={errors.captcha ? "true" : "false"}
                            aria-label={t("account.captcha")}
                          />
                          <span className="login-captcha-count">
                            {t("account.captchaCount", { count: captchaInput.length })}
                          </span>
                        </span>

                        {captcha.imageDataUrl ? (
                          <button
                            type="button"
                            className="login-captcha-image-button"
                            onClick={() => void fetchCaptcha({ clearInput: true })}
                            title={t("account.captchaRefresh")}
                            aria-label={t("account.captchaRefresh")}
                          >
                            <span key={captchaNonce} className="login-captcha-flip">
                              <img
                                className="login-captcha-image"
                                src={captcha.imageDataUrl}
                                alt={t("account.captchaImageAlt")}
                              />
                            </span>
                          </button>
                        ) : null}

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
                          <LoginIcon name="warn" size={12} />
                          {t(errors.captcha)}
                          {attempts >= 2 ? (
                            <span className="login-field-error-extra">
                              {" "}
                              · {t("account.captchaHintRetry")}
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="login-field-hint">{t("account.captchaHint")}</p>
                      )}
                    </div>
                  ) : null}

                  <div className="login-remember-row">
                    <label className="login-remember-label">
                      <input
                        type="checkbox"
                        className="login-remember-input"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                        disabled={submitting}
                      />
                      <span className="login-remember-switch" aria-hidden="true" />
                      <span className="login-remember-text">{t("account.rememberMe")}</span>
                    </label>
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
                    className="login-submit"
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

                  <p className="login-demo-note">{t("account.note")}</p>
                </form>
              </div>
            ) : (
              <div className="login-success">
                <span className="login-success-shield">
                  <LoginIcon name="shield" size={28} />
                </span>
                <h2 className="login-success-title">{t("account.successTitle")}</h2>
                <p className="login-success-body">{t("account.successBody", { name: account })}</p>
                <button type="button" className="login-submit login-success-enter" onClick={enterWorkspace}>
                  {t("account.enterWorkspace")}
                  <LoginIcon name="arrow" size={16} />
                </button>
                <button
                  type="button"
                  className="login-success-switch"
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
            )}

            <div className="login-statusbar">
              <span className="login-statusbar-keys">
                <span className="login-keycap">Enter</span>
                {t("account.statusbarEnter")}
                <span className="login-keycap login-keycap-spaced">Esc</span>
                {t("account.statusbarEsc")}
              </span>
              <span className="login-statusbar-state">
                {serviceReachable ? (
                  <>
                    <span className="login-service-dot" aria-hidden="true" />
                    {t("account.serviceOk")}
                  </>
                ) : (
                  <>
                    <span className="login-service-dot is-down" aria-hidden="true" />
                    {t("account.serviceDown")}
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {toast ? (
        <div className="login-toast" role="status">
          <LoginIcon name="check" size={16} />
          {toast}
        </div>
      ) : null}
    </main>
  );
}
