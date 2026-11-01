import type { Calendar } from '@vtt/shared';
import { dayPart } from '../../calendar-view.ts';

const SKY = {
  night: 'from-[#0b1020] to-[#1a1f33]',
  dawn: 'from-[#3a2a3f] to-[#a8664a]',
  day: 'from-[#3c5a78] to-[#8fb0c4]',
  dusk: 'from-[#2c2240] to-[#b0573a]',
};

const R = 26;
const STARS = [
  [20, 18],
  [41, 14],
  [47, 27],
  [16, 31],
  [33, 22],
];
/** A point on the dial for `hour`: midnight at the bottom, noon at the top. */
function at(hour: number, r = R) {
  const a = (hour / 24) * 2 * Math.PI;
  return { x: 32 - r * Math.sin(a), y: 32 + r * Math.cos(a) };
}

/** The arc of the day, sunrise to sunset, clockwise across the top. */
function dayArc(calendar: Calendar) {
  const from = at(calendar.sunrise);
  const to = at(calendar.sunset);
  const large = calendar.sunset - calendar.sunrise > 12 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${R} ${R} 0 ${large} 1 ${to.x} ${to.y}`;
}

/** A 24-hour dial: the sky's colour, the day's arc, and the sun or moon where the hour is. */
export function SkyDial({ calendar, hour }: Readonly<{ calendar: Calendar; hour: number }>) {
  const part = dayPart(calendar, hour);
  const up = part !== 'night';
  const body = at(hour);
  return (
    <div
      className={`relative size-16 shrink-0 rounded-full border border-gold-dim bg-linear-to-b ${SKY[part]} shadow-[inset_0_2px_8px_rgba(0,0,0,0.7),0_0_0_3px_rgba(0,0,0,0.5),0_0_0_4px_rgba(168,138,94,0.35)]`}
      title={`${part[0]!.toUpperCase()}${part.slice(1)}`}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="2" />
        <path d={dayArc(calendar)} fill="none" stroke="rgba(232,211,166,0.55)" strokeWidth="2" strokeLinecap="round" />
        {part === 'night' &&
          STARS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="#e8e2d0" opacity="0.8" />)}
        <line x1="6" y1="32" x2="58" y2="32" stroke="rgba(0,0,0,0.3)" strokeWidth="1" strokeDasharray="2 3" />
        {up ? (
          <circle cx={body.x} cy={body.y} r="5" fill="#ffd98a" stroke="#fff3d6" strokeWidth="1" />
        ) : (
          <path
            d={`M ${body.x + 1} ${body.y - 5} a 5 5 0 1 0 4 8 a 4 4 0 1 1 -4 -8 z`}
            fill="#dfe6f2"
            stroke="#9aa6bd"
            strokeWidth="0.6"
          />
        )}
      </svg>
      {up && (
        <div
          className="pointer-events-none absolute size-6 -translate-1/2 rounded-full bg-[#ffd98a]/30 blur-sm"
          style={{ left: `${(body.x / 64) * 100}%`, top: `${(body.y / 64) * 100}%` }}
        />
      )}
    </div>
  );
}
