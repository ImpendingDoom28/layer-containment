import { FC } from "react";

type LogoMarkProps = {
  className?: string;
};

// Containment reticle: tick ring + four layer plates holding an orange core.
export const LogoMark: FC<LogoMarkProps> = ({ className }) => (
  <svg
    viewBox="0 0 256 256"
    className={className}
    role="img"
    aria-label="Layer Containment mark"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g stroke="currentColor" strokeOpacity="0.9" strokeWidth="6" fill="none" strokeLinecap="round">
      <circle cx="128" cy="128" r="92" />
      <line x1="128" y1="16" x2="128" y2="28" />
      <line x1="128" y1="228" x2="128" y2="240" />
      <line x1="16" y1="128" x2="28" y2="128" />
      <line x1="228" y1="128" x2="240" y2="128" />
    </g>
    <g fill="currentColor" fillOpacity="0.75">
      <rect x="92" y="50" width="72" height="14" rx="7" />
      <rect x="92" y="76" width="72" height="14" rx="7" />
      <rect x="92" y="166" width="72" height="14" rx="7" />
      <rect x="92" y="192" width="72" height="14" rx="7" />
    </g>
    <polygon
      points="128,94 157.44,111 157.44,145 128,162 98.56,145 98.56,111"
      fill="var(--primary-hex, #ff6900)"
    />
    <polygon
      points="128,109 144.45,118.5 144.45,137.5 128,147 111.55,137.5 111.55,118.5"
      fill="none"
      stroke="var(--scene-black, #0a0a0f)"
      strokeWidth="5"
    />
  </svg>
);

LogoMark.displayName = "LogoMark";
