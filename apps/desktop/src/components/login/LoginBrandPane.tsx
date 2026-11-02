/**
 * The sign-in surface's left pane, ported from the approved design.
 *
 * Three blocks, top to bottom: the product mark, the promise with the three
 * working rhythms, and the feature cards — then a footer carrying the tagline
 * and the clock. The copy is the design's own, and the rhythms and features are
 * the product's real pillars rather than placeholders.
 *
 * The design's aurora-field colour dots are deliberately absent: they picked a
 * decorative palette by hand, and this surface follows the app's resolved theme
 * instead. The pane owns no colour state.
 */
import { useTranslation } from "react-i18next";
import { LoginIcon, type LoginIconName } from "./LoginIcons";

const RHYTHMS: ReadonlyArray<{ key: string; descKey: string }> = [
  { key: "Agent", descKey: "account.rhythmAgentDesc" },
  { key: "Plan", descKey: "account.rhythmPlanDesc" },
  { key: "Goal", descKey: "account.rhythmGoalDesc" },
];

const FEATURES: ReadonlyArray<{
  icon: LoginIconName;
  titleKey: string;
  descKey: string;
  riseClass: string;
}> = [
  {
    icon: "panels",
    titleKey: "account.featureWorkspaceTitle",
    descKey: "account.featureWorkspaceDesc",
    riseClass: "login-rise-feature-1",
  },
  {
    icon: "nodes",
    titleKey: "account.featureAgentsTitle",
    descKey: "account.featureAgentsDesc",
    riseClass: "login-rise-feature-2",
  },
  {
    icon: "plug",
    titleKey: "account.featureModelsTitle",
    descKey: "account.featureModelsDesc",
    riseClass: "login-rise-feature-3",
  },
];

/** Four bars; the stylesheet gives each its own period and offset. */
function Equalizer() {
  return (
    <span className="login-equalizer" aria-hidden="true">
      {[0, 1, 2, 3].map((bar) => (
        <span key={bar} className="login-eq-bar" />
      ))}
    </span>
  );
}

export function LoginBrandPane({
  clock,
  onPrivacy,
}: {
  clock: string;
  onPrivacy: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="login-pane-brand">
      <div className="login-brand-glow" aria-hidden="true" />

      <div className="login-brand-mark login-rise-1">
        <span className="login-brand-mark-chip">
          <LoginIcon name="panels" size={20} />
        </span>
        <div>
          <p className="login-brand-mark-name">{t("account.brandName")}</p>
          <p className="login-brand-mark-tag">{t("account.brandTag")}</p>
        </div>
      </div>

      <div className="login-brand-story login-rise-2">
        <h2 className="login-brand-heading">
          {t("account.brandHeading1")}
          <br />
          {t("account.brandHeading2")}
        </h2>
        <p className="login-brand-body">{t("account.brandBody")}</p>

        <div className="login-rhythm-list">
          {RHYTHMS.map((rhythm) => (
            <div key={rhythm.key} className="login-rhythm">
              <span className="login-rhythm-key">{rhythm.key}</span>
              <span className="login-rhythm-desc">{t(rhythm.descKey)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="login-feature-list">
        {FEATURES.map((feature) => (
          <div key={feature.titleKey} className={`login-feature-card ${feature.riseClass}`}>
            <span className="login-feature-chip">
              <LoginIcon name={feature.icon} size={16} />
            </span>
            <span className="login-feature-copy">
              <span className="login-feature-title">{t(feature.titleKey)}</span>
              <span className="login-feature-desc">{t(feature.descKey)}</span>
            </span>
            <Equalizer />
          </div>
        ))}
      </div>

      <div className="login-brand-footer login-rise-7">
        <p className="login-brand-tagline">
          {t("account.tagline")}
          <span className="login-brand-tagline-dot" aria-hidden="true">
            ·
          </span>
          <button type="button" className="login-terms-link" onClick={onPrivacy}>
            {t("account.privacy")}
          </button>
        </p>
        <span className="login-clock">{clock}</span>
      </div>
    </section>
  );
}
