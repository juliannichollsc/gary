// GARY 🐾 — icon set. Line icons (lucide-style, 1.75 stroke) for functional UI; the Paw is the
// crafted brand asset (used as avatar/hero/loader only — never as a nav icon).
import type { SVGProps } from "react";

const S = (p: SVGProps<SVGSVGElement>) => ({
  width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const, ...p,
});

export const MessageSquare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
);
export const Map = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>
);
export const Sparkles = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></svg>
);
export const Settings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
);
export const Sun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const Moon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
);
export const Send = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
);
export const Check = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const X = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const HelpCircle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
);
export const Eye = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const EyeOff = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.2M6.6 6.6A17.6 17.6 0 0 0 2 11s3.5 7 10 7a10.9 10.9 0 0 0 4.4-.9M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
);
export const Loader = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)} className={"gary-spin " + (p.className ?? "")}><path d="M12 3a9 9 0 1 0 9 9" /></svg>
);
export const File = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /></svg>
);
export const Upload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 9l5-5 5 5M12 4v12" /></svg>
);
export const Plus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const Search = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
export const ChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="m6 9 6 6 6-6" /></svg>
);
export const ChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="m9 6 6 6-6 6" /></svg>
);
export const BarChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...S(p)}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
);

// The Paw — brand mark (crafted SVG, not the emoji). Sized by `size`, colored by currentColor.
export const Paw = ({ size = 24, ...p }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <ellipse cx="7.2" cy="9.5" rx="1.9" ry="2.5" />
    <ellipse cx="12" cy="7.6" rx="2" ry="2.7" />
    <ellipse cx="16.8" cy="9.5" rx="1.9" ry="2.5" />
    <ellipse cx="4.4" cy="14.4" rx="1.6" ry="2.1" />
    <path d="M12 12.2c2.8 0 5 1.9 5 4.2 0 1.9-1.6 3-3.4 2.6-1-.24-2.2-.24-3.2 0C8.6 19.4 7 18.3 7 16.4c0-2.3 2.2-4.2 5-4.2Z" />
  </svg>
);
