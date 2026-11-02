/**
 * The sign-in surface's theme and layout contract.
 *
 * Two properties are easy to break silently, and neither is visible to a colour
 * or type check: the surface must carry no palette of its own (so "主题跟随系统"
 * holds), and its column must hand out every pixel the window gives it (so the
 * status bar stays on the bottom edge at any window height).
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

const rule = (selector) => {
  const start = loginCss.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return loginCss.slice(start, loginCss.indexOf("\n}", start));
};

test("first paint resolves the palette from the OS, not a hardcoded value", () => {
  assert.match(main, /prefers-color-scheme: light/);
  assert.doesNotMatch(
    main,
    /dataset\.theme = "dark";/,
    "the pre-settings paint must not pin the dark palette",
  );
});

test("the surface carries no palette of its own", () => {
  // Following the system theme means the component overrides nothing: the
  // gradient, the glass and the ink all resolve through the theme-root tokens,
  // so a palette change reaches the surface with no component involvement.
  for (const file of [loginTsx, brandPane]) {
    assert.doesNotMatch(file, /--ds-login-[a-z0-9-]+["']?\s*:/);
    assert.doesNotMatch(file, /#[0-9a-f]{3,8}\b/i);
    assert.doesNotMatch(file, /MutationObserver/);
  }
  assert.doesNotMatch(loginTsx, /style=\{/, "the surface sets no inline style");
  assert.match(rule(".login-screen"), /background: var\(--ds-login-surface\);/);
  assert.match(rule(".login-pane-brand"), /background: var\(--ds-login-brand-pane\);/);
});

test("every login token is defined on both theme roots", () => {
  const darkBlock = tokens.slice(
    tokens.indexOf(':root,\n:root[data-theme="dark"] {'),
    tokens.indexOf(':root[data-theme="light"] {'),
  );
  const lightBlock = tokens.slice(
    tokens.indexOf(':root[data-theme="light"] {'),
    tokens.indexOf("@theme {"),
  );
  const dark = new Set(
    [...darkBlock.matchAll(/(--ds-login-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
  const light = new Set(
    [...lightBlock.matchAll(/(--ds-login-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
  assert.ok(dark.size >= 40, `expected a full token set, found ${dark.size}`);
  assert.deepEqual([...light].sort(), [...dark].sort(), "the roots define the same tokens");

  // Every token the stylesheet reaches for actually exists.
  for (const name of [...loginCss.matchAll(/var\(\s*(--ds-login-[a-z0-9-]+)/g)].map((m) => m[1])) {
    assert.ok(dark.has(name), `${name} is not defined on the dark root`);
  }
});

test("the surface is the window: no card chrome, no dead space", () => {
  // The design leaves the login page no margin, radius, border or shadow; the
  // OS frame is the only frame. A reintroduced card floats again at large
  // window heights and reopens the band of bare background beneath it.
  assert.match(rule(".login-screen"), /flex-direction: column;/);
  assert.doesNotMatch(loginCss, /width: min\(/, "the window is not a fixed-size card");
  const window = rule(".login-window");
  assert.match(window, /flex: 1 1 auto;/);
  assert.match(window, /min-height: 0;/);
  assert.doesNotMatch(window, /border-radius|box-shadow|backdrop-filter/);
});

test("the vertical chain reaches the window's bottom edge", () => {
  assert.match(rule(".login-body"), /flex: 1 1 auto;/);
  assert.match(rule(".login-body"), /min-height: 0;/);
  assert.match(rule(".login-pane-form"), /flex: 1 1 auto;/);
  assert.match(rule(".login-statusbar"), /height: 44px;/);
  assert.match(rule(".login-statusbar"), /flex-shrink: 0;/);
});

test("the form scrolls, never the pane that holds the status bar", () => {
  assert.match(rule(".login-form-scroll"), /overflow-y: auto;/);
  assert.doesNotMatch(rule(".login-pane-form"), /overflow-y:/);
});

test("a short window drops the narrative, not the privacy footer", () => {
  // Measured: the brand pane needs 710px of content under a 44px title bar, so
  // everything fits from 754px. Below that the feature cards go, then the
  // rhythms; the mark, the promise and the footer stay.
  assert.match(
    loginCss,
    /@media \(max-height: 754px\) \{\s*\.login-feature-list \{ display: none; \}/,
  );
  assert.match(
    loginCss,
    /@media \(max-height: 520px\) \{\s*\.login-rhythm-list \{ display: none; \}/,
  );
  // The pane can always scroll to what is left, so nothing is unreachable.
  assert.match(rule(".login-pane-brand"), /overflow-y: auto;/);
});

test("the feature card stacks the title over the description", () => {
  // Both lines are spans in the component, so an inline display puts the
  // description back on the title's line and only wraps when the copy happens
  // to be long. The design stacks them in every language.
  assert.match(rule(".login-feature-title"), /display: block;/);
  assert.match(rule(".login-feature-desc"), /display: block;/);
  assert.match(rule(".login-feature-desc"), /text-overflow: ellipsis;/);
  assert.match(rule(".login-feature-copy"), /min-width: 0;/);
});

test("the stylesheet paints only through tokens", () => {
  // Static ramps escape the theme system no matter which rule carries them.
  assert.doesNotMatch(loginCss, /var\(\s*--gray-/);
  assert.doesNotMatch(loginCss, /var\(\s*--accent-/);
  assert.doesNotMatch(loginCss, /var\(\s*--color-/);
  for (const line of loginCss.split("\n")) {
    const declaration = line.match(
      /^\s*(color|background|background-color|background-image|border-color)\s*:\s*([^;]+);/,
    );
    if (!declaration) continue;
    const value = declaration[2];
    if (value.includes("var(") || value.startsWith("url(")) continue;
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

test("reduced motion silences the surface and leaves the result visible", () => {
  const block = loginCss.slice(loginCss.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(block.length > 0, "a reduced-motion block exists");
  for (const selector of [".login-window", ".login-eq-bar", ".login-progress-bar", ".login-success-check"]) {
    assert.ok(block.includes(selector), `${selector} is silenced under reduced motion`);
  }
  // A drawn tick and a grown bar must show their end state, not stay hidden.
  assert.match(block, /\.login-success-check \{ stroke-dashoffset: 0; \}/);
  assert.match(block, /\.login-progress-bar \{ transform: scaleX\(1\); \}/);
});
