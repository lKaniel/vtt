import { isParty } from '@vtt/shared';
import { toEdition } from '@vtt/system-dnd5e';
import { checkNamed, askedOf } from './check-text.ts';
import type { CheckRef, ContentLink } from './content-links.ts';
import { gameContent } from './content.ts';
import type { Session } from './session.ts';
import { itemTip, spellTip, type Tip } from './tooltip.ts';

// What the links, rolls and checks in journal text do when clicked: open
// the entry, sheet or scene they name (if you may), show rules content on
// hover, roll in chat, or roll a check.

export interface LinkTarget {
  /** The document's name, for a link written without a label. */
  name?: string;
  open?: () => void;
  tip?: Tip;
}

const nameOf = (doc: Record<string, unknown> | undefined) => (typeof doc?.name === 'string' ? doc.name : undefined);

function contentTarget(session: Session, link: ContentLink): LinkTarget {
  const book = gameContent(toEdition(session.world?.rules));
  if (link.kind === 'spell') {
    const spell = book.spells.get(link.id);
    return spell ? { name: spell.name, tip: spellTip(spell) } : {};
  }
  if (link.kind === 'item') {
    const item = book.items.get(link.id);
    return item ? { name: item.name, tip: itemTip(item, item.id, false) } : {};
  }
  const monster = book.monsters.get(link.id);
  if (!monster) return {};
  const facts = [`AC ${monster.ac} · HP ${monster.hp} · ${monster.speed} ft`];
  return { name: monster.name, tip: { title: monster.name, subtitle: monster.type ?? '', facts, body: '' } };
}

function docTarget(session: Session, link: ContentLink): LinkTarget {
  if (link.kind === 'journal') {
    const name = nameOf(session.docs.get('journals', link.id));
    return name ? { name, open: () => session.journal.open(link.id, link.page) } : {};
  }
  if (link.kind === 'actor') {
    const actor = session.actors.get(link.id);
    return actor ? { name: actor.name, open: () => session.openSheet({ kind: 'actor', id: link.id }) } : {};
  }
  const name = nameOf(session.docs.get('scenes', link.id));
  if (!name) return {};
  return session.isGm() ? { name, open: () => session.scenes.view(link.id) } : { name };
}

/** What a link names, and what clicking it does (nothing: it isn't there, or not for you). */
export function linkTarget(session: Session, link: ContentLink): LinkTarget {
  const docs = link.kind === 'journal' || link.kind === 'actor' || link.kind === 'scene';
  return docs ? docTarget(session, link) : contentTarget(session, link);
}

/** An inline roll: sends its chat command. */
export const rollClick = (session: Session, command: string) => () => session.say(command);

/** An inline check: the GM asks it of the selected creatures or the party; a player rolls it for theirs. */
export function checkClick(session: Session, ref: CheckRef): (() => void) | undefined {
  const check = checkNamed(ref.name);
  if (!check) return undefined;
  if (session.isGm()) {
    const all = [...session.tokens.values()].filter((t) => t.sheet !== undefined);
    const tokens = askedOf(all, (id) => session.isSelected(id), isParty).map((t) => t.id);
    return () => session.requestCheck({ tokens, ...check, kind: 'each', ...(ref.dc && { dc: ref.dc }) });
  }
  return () => session.selected && session.rollCheck(session.selected, check);
}
