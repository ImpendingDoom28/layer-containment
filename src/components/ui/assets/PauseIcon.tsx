import type { FC, SVGProps } from "react";

type PauseIconProps = SVGProps<SVGSVGElement>;

export const PauseIcon: FC<PauseIconProps> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <rect x="5" y="4" width="5.5" height="16" rx="1" />
    <rect x="13.5" y="4" width="5.5" height="16" rx="1" />
  </svg>
);
