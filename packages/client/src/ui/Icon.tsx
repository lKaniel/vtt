import type { ReactElement } from 'react';
import type { Glyph, Icon as IconSpec } from '../icons.ts';

// Hand-drawn 24×24 glyphs for action tiles, effects and the log. Filled shapes
// use currentColor; `hole` shapes punch dark details into them.

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const hole = { fill: 'rgba(10, 8, 6, 0.75)' } as const;

const GLYPHS: Record<Glyph, ReactElement> = {
  sword: (
    <>
      <path d="M20.5 3.5 21 7.5 11 17.5 6.5 13 16.5 3z" />
      <path {...line} d="M5 11.5 12.5 19M8.5 15.5 3.5 20.5" />
    </>
  ),
  mace: (
    <>
      <path {...line} d="M4 20 12.5 11.5" />
      <circle cx="15.5" cy="8.5" r="4.5" />
      <path {...line} d="M15.5 2v2M22 8.5h-2M20 4l-1.4 1.4M15.5 15v-1.5M9 8.5h1.5" />
    </>
  ),
  bow: (
    <>
      <path {...line} d="M5 3c9 1 15 7 16 16" />
      <path {...line} strokeWidth={0.9} d="M5 3 21 19" />
      <path {...line} d="M3 21 17 7M17 7l-4.5.5M17 7l-.5 4.5" />
    </>
  ),
  claw: <path {...line} strokeWidth={2.4} d="M6 4c4 5 5 10 3 16M11.5 3c4 5 5 10 3 17M17 4c4 5 5 10 3 15" />,
  flame: (
    <>
      <path d="M12 2c1 4 6.5 6 6.5 12.5a6.5 6.5 0 0 1-13 0c0-3.5 2-5.5 3.5-6.5 0 2 .8 3.2 2 3.5-.5-3.5.2-6.5 1-9.5z" />
      <path {...hole} d="M12 21a3 3 0 0 1-3-3c0-2 1.5-3 3-5 1.5 2 3 3 3 5a3 3 0 0 1-3 3z" />
    </>
  ),
  snowflake: (
    <path
      {...line}
      d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 3.5l3 2 3-2M9 20.5l3-2 3 2M3 10.5l3.2-1.4L6 5.5M21 13.5l-3.2 1.4.2 3.6"
    />
  ),
  lightning: <path d="M13.5 2 4 14h7l-2 8 10-12.5h-7l2-7.5z" />,
  wave: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path
        {...line}
        d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.5 9.5 0 0 0 0 13M18.5 5.5a9.5 9.5 0 0 1 0 13"
      />
    </>
  ),
  drop: (
    <>
      <path d="M12 2c-3 5-7 9-7 13a7 7 0 0 0 14 0c0-4-4-8-7-13z" />
      <path {...hole} d="M9 15.5a3 3 0 0 0 3 3v-1.6a1.4 1.4 0 0 1-1.4-1.4z" />
    </>
  ),
  vial: (
    <>
      <path {...line} d="M9 2.5h6M10 2.5v6L5 18.2A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 1.8-2.8L14 8.5v-6" />
      <path d="M7 15h10l1.6 3.4a1.2 1.2 0 0 1-1.1 1.6h-11a1.2 1.2 0 0 1-1.1-1.6z" />
    </>
  ),
  skull: (
    <>
      <path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h10v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8z" />
      <circle {...hole} cx="9" cy="10.5" r="2" />
      <circle {...hole} cx="15" cy="10.5" r="2" />
      <path {...hole} d="M12 13.5l1.2 2.2h-2.4zM10 17.5h1v2.5h-1zM13 17.5h1v2.5h-1z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path {...line} d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  bolts: (
    <>
      <path {...line} d="M3 15 12 6M5 21l11-11M10 21l8-8" />
      <path d="M14.5 3.5 15.4 6l2.6.9-2.6.9-.9 2.6-.9-2.6L11 6.9l2.6-.9zM18.5 8l.9 2.5L22 11.4l-2.6.9-.9 2.6-.9-2.6L15 11.4l2.6-.9zM20 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  eye: (
    <>
      <path {...line} d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  heart: <path d="M12 21s-8.5-5-8.5-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.8C20.5 16 12 21 12 21z" />,
  paw: (
    <>
      <ellipse cx="6" cy="10" rx="2" ry="2.6" />
      <ellipse cx="10" cy="6" rx="2" ry="2.6" />
      <ellipse cx="14.5" cy="6" rx="2" ry="2.6" />
      <ellipse cx="18.5" cy="10" rx="2" ry="2.6" />
      <path d="M12.2 11c2.8 0 6 4.5 6 7a2.5 2.5 0 0 1-3 2.5c-1.2-.3-2-.8-3-.8s-1.8.5-3 .8a2.5 2.5 0 0 1-3-2.5c0-2.5 3.2-7 6-7z" />
    </>
  ),
  mist: <path {...line} d="M3 7c3-2 6 2 9 0s6-2 9 0M3 12c3-2 6 2 9 0s6-2 9 0M3 17c3-2 6 2 9 0s6-2 9 0" />,
  shield: (
    <>
      <path d="M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
      <path {...hole} d="M12 5v14.5c3.2-1.7 5.5-4.8 5.5-8.5V6.8z" />
    </>
  ),
  chain: (
    <>
      <rect {...line} x="2.5" y="8.5" width="11" height="7" rx="3.5" transform="rotate(-35 8 12)" />
      <rect {...line} x="10.5" y="8.5" width="11" height="7" rx="3.5" transform="rotate(-35 16 12)" />
    </>
  ),
  star: <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />,
  mask: (
    <>
      <path d="M3.5 4.5c5.5 2 11.5 2 17 0V11c0 6.5-4 10.5-8.5 10.5S3.5 17.5 3.5 11z" />
      <path
        {...hole}
        d="M6.5 10c1-1.3 3-1.3 4 0-1 .9-3 .9-4 0zM13.5 10c1-1.3 3-1.3 4 0-1 .9-3 .9-4 0zM8.5 15.5c2 1.8 5 1.8 7 0-1.5 2.8-5.5 2.8-7 0z"
      />
    </>
  ),
  swirl: <path {...line} d="M12 12a1 1 0 1 1 1-1 3 3 0 1 1-4-2.8 5 5 0 1 1-2.6 7.6 7 7 0 1 1 11.4 3.4" />,
  fist: (
    <>
      <path d="M5.5 10.5a2 2 0 0 1 4 0V9a2 2 0 0 1 4 0v.5a2 2 0 0 1 4 0V11a2 2 0 0 1 2 2v2c0 4-3 7-6.5 7H12c-3.5 0-6.5-3-6.5-6.5z" />
      <path {...hole} d="M9.5 10.5v3M13.5 9.5v3.5M17.5 11v2.5" stroke="rgba(10, 8, 6, 0.75)" strokeWidth={1.2} />
    </>
  ),
  boot: <path d="M7 2h7v9.5l5.2 2.4A3 3 0 0 1 21 16.6V20H4.5V17L6 12z" />,
};

/** A glyph on its own, in the current text colour. */
export function Glyph({ glyph, size = 24 }: Readonly<{ glyph: Glyph; size?: number }>) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      {GLYPHS[glyph]}
    </svg>
  );
}

/** A glyph on a tinted, glowing disc: the face of an action tile or effect badge. */
export function IconFace({ icon, size }: Readonly<{ icon: IconSpec; size?: number }>) {
  return (
    <span className={`icon-face tint-${icon.tint}`}>
      <Glyph glyph={icon.glyph} size={size} />
    </span>
  );
}
