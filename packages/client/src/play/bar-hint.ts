import type { TokenView } from '@vtt/system-dnd5e';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';

// The line over the action bar: what the next click (or tap) does.

/** What to do next, in a mouse's words. */
export function barHint(session: Session, token: TokenView | undefined): string {
  if (session.actions.armed) return `Click a target for ${session.actions.armed} · right click or Esc to cancel`;
  const aiming = session.actions.aiming;
  if (aiming?.mode === 'point') return `Click where ${aiming.spell.name} goes · right click or Esc to cancel`;
  if (aiming)
    return `Click ${aiming.need - aiming.picks.length} more target(s) for ${aiming.spell.name} · right click or Esc to cancel`;
  if (!token) return t('actionBar.clickOneOfYour');
  return IDLE_HINT;
}

/** The same asks for a finger: tap, and tap the tile again to let go of it. */
export function phoneHint(session: Session, token: TokenView | undefined): string {
  if (session.actions.armed) return t('phone.hint.attack', { name: session.actions.armed });
  const aiming = session.actions.aiming;
  if (aiming?.mode === 'point') return t('phone.hint.point', { name: aiming.spell.name });
  if (aiming) return t('phone.hint.targets', { count: aiming.need - aiming.picks.length, name: aiming.spell.name });
  return token ? IDLE_HINT : t('phone.hint.select');
}

export const IDLE_HINT =
  'Click the ground to walk · Right click for more · 1–0 for actions · C for the sheet · Space ends your turn';
