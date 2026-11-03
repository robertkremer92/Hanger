import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const IconBack = (p: P) => <svg {...base} strokeWidth={2} {...p}><path d="M15 5l-7 7 7 7" /></svg>;
export const IconSearch = (p: P) => <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
export const IconPlus = (p: P) => <svg {...base} {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" /></svg>;
export const IconBox = (p: P) => <svg {...base} {...p}><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" /><path d="M4 8.5 12 13l8-4.5M12 13v7" /></svg>;
export const IconPerson = (p: P) => <svg {...base} {...p}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4" /></svg>;
export const IconCheck = (p: P) => <svg {...base} strokeWidth={2.4} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconShield = (p: P) => <svg {...base} {...p}><path d="M12 3.5 5 6v5.5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
export const IconLock = (p: P) => <svg {...base} {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>;
export const IconClock = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IconInfo = (p: P) => <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></svg>;
export const IconWarn = (p: P) => <svg {...base} {...p}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17h.01" /></svg>;
export const IconChevron = (p: P) => <svg {...base} strokeWidth={2} {...p}><path d="m6 9 6 6 6-6" /></svg>;
export const IconRight = (p: P) => <svg {...base} strokeWidth={2} {...p}><path d="m9 5 7 7-7 7" /></svg>;
export const IconCamera = (p: P) => <svg {...base} {...p}><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
export const IconScale = (p: P) => <svg {...base} {...p}><path d="M12 4v16M6 20h12M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z" /></svg>;
export const IconChat = (p: P) => <svg {...base} {...p}><path d="M5 18.5V6.5A2 2 0 0 1 7 4.5h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5z" /></svg>;
export const IconBank = (p: P) => <svg {...base} {...p}><path d="M3.5 9.5 12 4.5l8.5 5M5 9.5V17M9.5 9.5V17M14.5 9.5V17M19 9.5V17M3.5 19.5h17" /></svg>;
export const IconId = (p: P) => <svg {...base} {...p}><rect x="3" y="5.5" width="18" height="13" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 15.5c.6-1.3 1.7-2 3-2s2.4.7 3 2M14.5 10h4M14.5 13h3" /></svg>;
export const IconMail = (p: P) => <svg {...base} {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;

export function Wordmark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 9.5a3 3 0 1 1 4 2.8c-.6.2-1 .8-1 1.4V15" />
      <path d="M16 15 4 23.5h24z" fill="var(--tag)" />
    </svg>
  );
}
