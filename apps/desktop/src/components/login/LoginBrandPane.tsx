/**
 * The sign-in surface's left pane, ported from the approved design.
 *
 * The design's aurora-field dots are deliberately absent: they picked a
 * decorative palette, and this surface follows the app's resolved theme instead
 * (light paints the design's "sunlight" field, dark its "night plum" field).
 * Nothing here overrides a palette, so the pane owns no colour state.
 */
import { useTranslation } from "react-i18next";
import { LoginIcon, type LoginIconName } from "./LoginIcons";

const SPECIMENS: ReadonlyArray<{
  icon: LoginIconName;
  titleKey: string;
  textKey: string;
  level: number;
  cls: string;
}> = [
  {
    icon: "sliders",
    titleKey: "account.specimenMaterialTitle",
    textKey: "account.specimenMaterialText",
    level: 3,
    cls: "login-spec-1",
  },
  {
    icon: "command",
    titleKey: "account.specimenShortcutsTitle",
    textKey: "account.specimenShortcutsText",
    level: 2,
    cls: "login-spec-2",
  },
  {
    icon: "spark",
    titleKey: "account.specimenCopilotTitle",
    textKey: "account.specimenCopilotText",
    level: 1,
    cls: "login-spec-3",
  },
];

export function LoginBrandPane({
  clock,
  onTerms,
  onPrivacy,
}: {
  clock: string;
  onTerms: () => void;
  onPrivacy: () => void;
}) {
  const { t } = useTranslation();

  return (
    <aside className="login-pane-brand">
      <div className="login-brand-glow-a" aria-hidden="true" />
      <div className="login-brand-glow-b" aria-hidden="true" />

      <div className="login-brand-lede">
        <div className="login-brand-mark">
          <span className="login-brand-mark-chip">
            <LoginIcon name="layers" size={18} />
          </span>
          <div>
            <p className="login-brand-mark-name">{t("account.brandName")}</p>
            <p className="login-brand-mark-tag">{t("account.brandTag")}</p>
          </div>
        </div>

        <h2 className="login-brand-heading">
          {t("account.brandHeading1")}
          <br />
          {t("account.brandHeading2")}
        </h2>
        <p className="login-brand-body">{t("account.brandBody")}</p>
      </div>

      <div className="login-specimen">
        {SPECIMENS.map((specimen, index) => (
          <div key={specimen.titleKey} className={`login-spec-plate ${specimen.cls}`}>
            <span className="login-spec-chip">
              <LoginIcon name={specimen.icon} size={14} />
            </span>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <p className="login-spec-title">{t(specimen.titleKey)}</p>
              <p className="login-spec-text">{t(specimen.textKey)}</p>
            </div>
            <span className="login-spec-ticks" aria-hidden="true">
              {[0, 1, 2, 3].map((tick) => (
                <span
                  key={tick}
                  className={`login-spec-tick ${tick <= specimen.level ? "on" : ""}`}
                  style={{
                    height: `${8 + tick * 5}px`,
                    animationDelay: `${(index * 0.4 + tick * 0.22).toFixed(2)}s`,
                  }}
                />
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className="login-brand-footer">
        <p className="login-terms">
          {t("account.termsNote")}
          <button type="button" className="login-terms-link" onClick={onTerms}>
            {t("account.terms")}
          </button>
          {t("account.termsAnd")}
          <button type="button" className="login-terms-link" onClick={onPrivacy}>
            {t("account.privacy")}
          </button>
        </p>
        <span className="login-clock">{clock}</span>
      </div>
    </aside>
  );
}
