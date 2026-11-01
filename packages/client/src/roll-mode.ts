import { type ChatEntry, ROLL_MODES, type RollMode } from '@vtt/shared';

// The roll mode this browser rolls in (see roll-modes.ts in shared), kept
// between visits. Storage can be missing or blocked: then it is public.

const KEY = 'vtt.rollMode';

/** Missing outside a browser (tests). */
const storage = (): Storage | undefined => (globalThis as { localStorage?: Storage }).localStorage;

export function loadRollMode(): RollMode {
  try {
    const saved = storage()?.getItem(KEY);
    return ROLL_MODES.find((m) => m === saved) ?? 'public';
  } catch {
    return 'public';
  }
}

export function saveRollMode(mode: RollMode): void {
  try {
    storage()?.setItem(KEY, mode);
  } catch {
    // Not kept: it still holds for this visit.
  }
}

/** The roll modes as the chat panel offers them. */
export const ROLL_MODE_OPTIONS: { value: RollMode; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'gm', label: 'Private GM' },
  { value: 'blind', label: 'Blind GM' },
  { value: 'self', label: 'Self' },
];

const NOTES: Record<Exclude<RollMode, 'public'>, string> = { gm: 'to GM', blind: 'blind', self: 'self' };

/** The note beside who sent a message: who else sees it ("to GM", "blind", "self"); none when it's public. */
export function modeNote(m: Pick<ChatEntry, 'mode'>): string | undefined {
  return m.mode && NOTES[m.mode];
}

/** What a blind roll says to whoever rolled it. */
export const HIDDEN_ROLL = 'Rolled in secret: only the GM sees the result.';
