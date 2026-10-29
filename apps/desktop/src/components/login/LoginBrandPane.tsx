/**
 * The sign-in surface's left pane, ported from the approved design.
 *
 * The aurora field dots are part of that design, so they stay interactive: each
 * one repaints the decorative light field. They never override the app's theme
 * authority — the resolved system theme chooses the *default* field (sunlight
 * on light, night plum on dark) and each field carries its own ink so contrast
 * holds whichever the system resolved.
 */
import { useTranslation } from "react-i18next";
import { LoginIcon, type LoginIconName } from "./LoginIcons";

export type AuroraField = {
  id: string;
  nameKey: string;
  a: string;
  b: string;
  c: string;
  glow: string;
  /** Ink that clears 4.5:1 against this field. */
  ink: string;
  base: string;
  glassTint: number;
  glassEdge: number;
};

/** The four fields the design ships, each self-contained for contrast. */
export const AURORA_FIELDS: readonly AuroraField[] = [
  {
    id: "aurora",
    nameKey: "account.theme.aurora",
    a: "#ee5a86",
    b: "#a05cc4",
    c: "#4a6ce2",
    glow: "rgba(255,255,255,0.5)",
    ink: "#2b1244",
    base: "#8f66c9",
    glassTint: 0.3,
    glassEdge: 0.45,
  },
  {
    id: "citrus",
    nameKey: "account.theme.citrus",
    a: "#ff8a3d",
    b: "#f4518f",
    c: "#8f4ad6",
    glow: "rgba(255,236,190,0.55)",
    ink: "#3b1024",
    base: "#d4699b",
    glassTint: 0.3,
    glassEdge: 0.45,
  },
  {
    id: "tide",
    nameKey: "account.theme.tide",
    a: "#2fd6c3",
    b: "#4a86e2",
    c: "#7a4ad6",
    glow: "rgba(210,255,250,0.5)",
    ink: "#0e2f3c",
    base: "#3f9bd8",
    glassTint: 0.3,
    glassEdge: 0.45,
  },
  {
    id: "plum",
    nameKey: "account.theme.plum",
    a: "#3b1f5e",
    b: "#6d3fd4",
    c: "#1f2f6b",
    glow: "rgba(200,180,255,0.42)",
    ink: "#f2ecfb",
    base: "#241539",
    glassTint: 0.14,
    glassEdge: 0.28,
  },
];

/** The field a resolved palette defaults to. */
export function defaultAuroraField(resolvedTheme: "light" | "dark"): AuroraField {
  return resolvedTheme === "light" ? AURORA_FIELDS[0] : AURORA_FIELDS[3];
}

/** Read the palette the app actually resolved, from the theme attribute. */
export function resolvedThemeFromDocument(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

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
  field,
  onField,
  clock,
  onTerms,
  onPrivacy,
}: {
  field: AuroraField;
  onField: (field: AuroraField) => void;
  clock: string;
  onTerms: () => void;
  onPrivacy: () => void;
}) {
  const { t } = useTranslation();

  return (
    <aside className="login-pane-brand">
      <div className="login-brand-glow-a" aria-hidden="true" />
      <div className="login-brand-glow-b" aria-hidden="true" />

      <div>
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
        <div className="login-brand-footer-row">
          <div className="login-theme-dots">
            {AURORA_FIELDS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="login-theme-dot"
                onClick={() => onField(entry)}
                aria-pressed={entry.id === field.id}
                title={t(entry.nameKey)}
                aria-label={t("account.themeSwitchTo", { name: t(entry.nameKey) })}
                style={{ background: `linear-gradient(140deg, ${entry.a}, ${entry.c})` }}
              />
            ))}
            <span className="login-theme-name">{t(field.nameKey)}</span>
          </div>
          <span className="login-clock">{clock}</span>
        </div>
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
      </div>
    </aside>
  );
}
