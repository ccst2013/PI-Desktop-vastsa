/**
 * The sign-in surface's icon set, ported from the approved design.
 *
 * Single-path stroke glyphs on a 24-unit box with a 1.8 stroke, exactly as the
 * design drew them: each entry is one `d` whose sub-paths are separated by `M`,
 * which keeps every glyph the same weight and join style. The app's own
 * `components/icons` set is a different visual family, and mixing the two on one
 * surface would read as two products.
 */
import type { SVGProps } from "react";

export type LoginIconName =
  | "lock"
  | "user"
  | "eye"
  | "eyeOff"
  | "key"
  | "refresh"
  | "arrow"
  | "sliders"
  | "command"
  | "spark"
  | "layers"
  | "help"
  | "minus"
  | "panels"
  | "nodes"
  | "plug"
  | "check"
  | "x";

const PATHS: Record<LoginIconName, string> = {
  lock: "M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0",
  eyeOff:
    "M4 4l16 16 M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 6 10 6a17 17 0 0 1-2.7 3.4 M6.6 6.6A16.6 16.6 0 0 0 2 11s3.5 6 10 6c1.4 0 2.7-.3 3.8-.7 M10.2 10.3a2.5 2.5 0 0 0 3.5 3.5",
  key: "M14 10a4 4 0 1 0-3.6 4L12 15.5V18h2.5v2H17v-3.5L20.5 13 14.4 6.9A4 4 0 0 0 14 10z M16.5 9.5h.01",
  refresh: "M20 11a8 8 0 1 0-2.3 6.3 M20 5v6h-6",
  arrow: "M4 12h15 M13 6l6 6-6 6",
  sliders: "M5 7h9 M18 7h1 M5 12h3 M12 12h7 M5 17h9 M18 17h1 M16 5v4 M10 10v4 M16 15v4",
  command:
    "M9 9V6a3 3 0 1 0-3 3h3z M15 9V6a3 3 0 1 1 3 3h-3z M9 15v3a3 3 0 1 1-3-3h3z M15 15v3a3 3 0 1 0 3-3h-3z M9 9h6v6H9z",
  spark:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  layers: "M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5",
  help: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M9.6 9.2a2.5 2.5 0 1 1 3.4 2.6c-.8.4-1 1-1 1.8 M12 17h.01",
  minus: "M6 12h12",
  panels: "M4 5h16v14H4z M9.5 5v14 M12.5 9.5l2 2-2 2 M17 9.5h1.5 M17 13.5h1.5",
  nodes:
    "M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M8 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M20 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M12 7v3 M12 10l-4.5 5 M12 10l4.5 5",
  plug: "M9 3v5 M15 3v5 M7 8h10v3a5 5 0 0 1-10 0z M12 16v5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12 M18 6L6 18",
};

export function LoginIcon({
  name,
  size = 16,
  ...rest
}: { name: LoginIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className="login-icon"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * The success mark. The design draws the tick in from a hidden dash offset,
 * which needs the path addressable from the stylesheet rather than folded into
 * the generic icon helper.
 */
export function LoginCheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="login-success-check"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS.check} />
    </svg>
  );
}
