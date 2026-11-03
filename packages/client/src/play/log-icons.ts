import type { AttackLog, SpellLog } from '@vtt/system-dnd5e';
import { gameContent } from '../content/content.ts';
import { attackArt, spellArt } from '../icon-art.ts';
import { attackIcon, damageIcon, type Icon, spellIcon } from '../icons.ts';

// The icon on an attack or spell card in chat: the same one its tile on the
// hotbar and its row on the sheet show, pack art included.

export function attackLogIcon(a: AttackLog): Icon {
  const attack = { name: a.attack, kind: a.kind, damage: a.parts.map((p) => ({ dice: '', type: p.type })) };
  const art = attackArt(attack);
  return { ...attackIcon({ ...attack, toHit: 0 }), ...(art && { art }) };
}

export function spellLogIcon(s: SpellLog): Icon {
  const known = gameContent('2014').spells.get(s.spellId) ?? gameContent('2024').spells.get(s.spellId);
  const art = spellArt({ id: s.spellId, name: s.spell });
  return { ...(known ? spellIcon(known) : damageIcon(s.damageType)), ...(art && { art }) };
}
