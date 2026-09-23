// The game's icons. They replaced emoji, which drew differently on every
// platform (Segoe's flat glyphs on Windows, Apple's glossy ones on a phone) and
// were the loudest thing on a page that is otherwise a printed menu.
//
// One stroke weight, round caps, drawn in currentColor, so an icon takes the
// colour of the text beside it and the After Dark token swap reaches it with no
// second set. Always decorative: every icon sits beside a word that says the
// same thing, or on a control that carries its own aria-label. The share text
// keeps its emoji; that grid is the message, not chrome.

import type { ReactNode } from "react";

const PATHS = {
  bell: (
    <>
      <path d="M3.5 18.5h17" />
      <path d="M5 18.5a7 7 0 0 1 14 0" />
      <path d="M12 11.5v-2" />
      <path d="M10.2 9.2h3.6" />
    </>
  ),
  glass: (
    <>
      <path d="M4.5 4.5h15L12 13z" />
      <path d="M12 13v7" />
      <path d="M8.5 20h7" />
      <circle cx="12.6" cy="7.4" r="1.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  cutlery: (
    <>
      <path d="M6 3v5.5a2 2 0 0 0 4 0V3" />
      <path d="M8 3v5" />
      <path d="M8 10.5V21" />
      <path d="M17 21V3c-2 1.5-3 4-3 7.5 0 1.2.8 2 2 2h1" />
    </>
  ),
  flame: (
    <path d="M12 21c3.6 0 6-2.4 6-5.7 0-3.3-2.3-5.3-3.5-8-.4 1.8-1.3 2.9-2.4 3.4.3-3.4-1-6.4-3.6-7.7.2 3-1.5 5-3 7C4.9 11.9 6 13.3 6 15.3 6 18.6 8.4 21 12 21z" />
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  stats: (
    <>
      <path d="M5 20v-8" />
      <path d="M10 20V6" />
      <path d="M15 20v-5" />
      <path d="M20 20V9" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
