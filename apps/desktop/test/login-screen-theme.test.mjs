/**
 * The sign-in surface's theme contract.
 *
 * "主题跟随系统" has three parts, each of which can regress invisibly: the first
 * paint must follow the OS rather than a hardcoded palette, the surface must
 * re-resolve when the OS changes, and its paint must stay reachable by the
 * theme system (tokens on both roots, no static ramps, no arbitrary utilities).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(join(here, relative), "utf8");

const main = read("src/main.tsx");
const tokens = read("src/styles/tokens.css");
const loginCss = read("src/styles/login.css");
const loginTsx = read("src/components/LoginScreen.tsx");
const brandPane = read("src/components/login/LoginBrandPane.tsx");
const globals = read("src/styles/globals.css");

test("first paint resolves the palette from the OS, not a hardcoded value", () => {
  assert.match(main, /prefers-color-scheme: light/);
  assert.doesNotMatch(
    main,
    /dataset\.theme = "dark";/,
    "the pre-settings paint must not pin the dark palette",
  );
});

test("the sign-in surface re-resolves when the resolved palette changes", () => {
  assert.match(loginTsx, /MutationObserver/);
  assert.match(loginTsx, /attributeFilter: \["data-theme"\]/);
  assert.match(loginTsx, /defaultAuroraField\(resolvedThemeFromDocument\(\)\)/);
});

test("the palette tokens live on both theme roots; the glass formulas on :root", () => {
  const darkBlock = tokens.slice(
    tokens.indexOf(':root,\n:root[data-theme="dark"] {'),
    tokens.indexOf(':root[data-theme="light"] {'),
  );
  const lightBlock = tokens.slice(
    tokens.indexOf(':root[data-theme="light"] {'),
    tokens.indexOf("@theme {"),
  );

  // The palette a theme may move: both roots must define each of these, or one
  // palette would fall through to the other's values.
  const palette = [
    "--ds-login-base",
    "--ds-login-aurora-1",
    "--ds-login-aurora-2",
    "--ds-login-aurora-3",
    "--ds-login-aurora-glow",
    "--ds-login-ink",
    "--ds-login-glass-tint",
    "--ds-login-glass-edge",
    "--ds-login-primary",
    "--ds-login-danger",
    "--ds-login-accent",
    "--ds-login-shadow",
  ];
  for (const name of palette) {
    assert.ok(darkBlock.includes(`${name}:`), `dark root defines ${name}`);
    assert.ok(lightBlock.includes(`${name}:`), `light root defines ${name}`);
  }

  // The derived layers that track the palette are formulas over the tokens
  // above, so they are declared once on :root and resolve per element against
  // whichever palette is active. Re-declaring them per root would freeze the
  // math into literals.
  for (const name of [
    "--ds-login-glass-sheen",
    "--ds-login-window-bg",
    "--ds-login-pane-brand",
  ]) {
    assert.ok(darkBlock.includes(`${name}:`), `:root defines the ${name} formula`);
    assert.ok(!lightBlock.includes(`${name}:`), `the light root must not re-declare ${name}`);
    const declaration = darkBlock.slice(darkBlock.indexOf(`${name}:`));
    assert.match(
      declaration.slice(0, declaration.indexOf(";") + 1),
      /var\(--ds-login-/,
      `${name} resolves through the palette tokens`,
    );
  }

  // The specimen plates are white glass by design in both palettes — the design
  // paints them white over either field — so they are neutral white-alpha,
  // declared once, and must not be mistaken for a palette escape.
  for (const name of ["--ds-login-spec-plate-bg", "--ds-login-spec-chip-bg"]) {
    assert.ok(darkBlock.includes(`${name}:`), `:root defines ${name}`);
    assert.ok(!lightBlock.includes(`${name}:`), `the light root must not re-declare ${name}`);
    const declaration = darkBlock.slice(darkBlock.indexOf(`${name}:`));
    assert.match(
      declaration.slice(0, declaration.indexOf(";") + 1),
      /rgb\(255 255 255 \//,
      `${name} is neutral white glass`,
    );
  }
});

test("the stylesheet paints only through tokens", () => {
  // Static ramps escape the theme system no matter which rule carries them.
  assert.doesNotMatch(loginCss, /var\(\s*--gray-/);
  assert.doesNotMatch(loginCss, /var\(\s*--accent-/);
  assert.doesNotMatch(loginCss, /var\(\s*--color-/);
  // Every colour declaration resolves through a variable.
  for (const line of loginCss.split("\n")) {
    const declaration = line.match(/^\s*(color|background|background-color|background-image|border-color)\s*:\s*([^;]+);/);
    if (!declaration) continue;
    const value = declaration[2];
    // A data-URI or url() is an image, not a palette colour; the grain overlay
    // carries no colour of its own (its rect is opacity-only).
    if (value.includes("var(") || value.startsWith("url(")) continue;
    // Keywords carry no palette: `none`, `transparent`, and the inherit family.
    if (/^(?:none|transparent|inherit|initial|unset|currentcolor)$/i.test(value.trim())) continue;
    assert.fail(`login.css paints a literal: ${line.trim()}`);
  }
});

test("the component carries no arbitrary-value utilities", () => {
  // scripts/check-style-tokens.mjs rejects these in TSX; assert here too so a
  // regression names the surface rather than a lint rule.
  for (const file of [loginTsx, brandPane]) {
    assert.doesNotMatch(file, /\b(?:text|rounded|leading|tracking|font)-\[[^\]]+\]/);
  }
});

test("the stylesheet is imported in the cascade, before the responsive tail", () => {
  const loginIndex = globals.indexOf('@import "./login.css";');
  const responsiveIndex = globals.indexOf('@import "./responsive.css";');
  assert.ok(loginIndex > 0, "login.css is imported");
  assert.ok(loginIndex < responsiveIndex, "the responsive tail still wins the cascade");
});

test("reduced motion silences the surface's animation", () => {
  assert.match(loginCss, /@media \(prefers-reduced-motion: reduce\)/);
});
