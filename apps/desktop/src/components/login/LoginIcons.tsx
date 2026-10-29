/**
 * The sign-in surface's linear icon set, ported from the approved design.
 *
 * Stroke-only glyphs at a 24-unit box and a 1.7 stroke, exactly as the design
 * drew them; the app's own `components/icons` set is a different visual family
 * and mixing the two on one surface would read as two products.
 */
import type { SVGProps } from "react";

export type LoginIconName =
  | "layers"
  | "lock"
  | "user"
  | "shield"
  | "eye"
  | "eyeOff"
  | "check"
  | "warn"
  | "arrow"
  | "sliders"
  | "command"
  | "spark"
  | "help"
  | "minus"
  | "refresh"
  | "key";

const PATHS: Record<LoginIconName, React.ReactNode> = {
  layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2l8 3.5v6c0 5-3.4 8.6-8 10.5-4.6-1.9-8-5.5-8-10.5v-6z" />
      <polyline points="8.5 11.5 11 14 15.5 9.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.6 6.6C3.7 8.6 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  warn: (
    <>
      <path d="M12 3l10 18H2z" />
      <line x1="12" y1="10" x2="12" y2="14.5" />
      <line x1="12" y1="17.5" x2="12.01" y2="17.5" />
    </>
  ),
  arrow: (
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="13 5 20 12 13 19" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  command: (
    <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
  ),
  spark: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  minus: <line x1="6" y1="12" x2="18" y2="12" />,
  refresh: (
    <>
      <polyline points="20.5 7 20.5 12 15.5 12" />
      <polyline points="3.5 17 3.5 12 8.5 12" />
      <path d="M20.2 12A8.2 8.2 0 0 0 6.3 6.6L3.5 9" />
      <path d="M3.8 12a8.2 8.2 0 0 0 13.9 5.4l2.8-2.4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L20 3" />
      <path d="M17 6l2.5 2.5" />
      <path d="M14.5 8.5L17 11" />
    </>
  ),
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
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className="login-icon"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
