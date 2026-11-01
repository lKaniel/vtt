import {
  ABILITIES,
  abilityMod,
  actorFromToken,
  type Edition,
  type Monster,
  toEdition,
  tokenFromMonster,
} from '@vtt/system-dnd5e';
import { uniqueId } from '@vtt/shared';
import { gameContent } from '../content.ts';
import { useState } from 'react';
import { CATEGORIES, compendium, crText, type Category, type Entry } from '../compendium.ts';
import type { Session } from '../session.ts';
import { attackTip, itemTip, spellTip, type Tip } from '../tooltip.ts';
import { startDrag } from './ActorsTab.tsx';

// The GM's Compendium tab: the SRD books, searchable. Drag a monster onto the
// map to place it, or an item or spell onto a creature to give it.

const LABEL: Record<Category, string> = {
  monsters: 'Monsters',
  weapons: 'Weapons',
  armor: 'Armour',
  gear: 'Gear',
  spells: 'Spells',
};
/** Rows shown at once; typing narrows the rest. */
const SHOWN = 120;

export function CompendiumTab({ session }: Readonly<{ session: Session }>) {
  const [category, setCategory] = useState<Category>('monsters');
  const [rules, setRules] = useState<Edition>(toEdition(session.world?.rules));
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string>();
  const list = compendium(category, rules, query);
  const editioned = category === 'monsters' || category === 'spells';
  return (
    <div className="lib">
      <nav className="lib-cats">
        {CATEGORIES.map((c) => (
          <button key={c} className={c === category ? 'on' : ''} onClick={() => setCategory(c)}>
            {LABEL[c]}
          </button>
        ))}
      </nav>
      <div className="lib-filter">
        <input
          className="lib-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${LABEL[category].toLowerCase()}…`}
        />
        {editioned && (
          <select value={rules} onChange={(e) => setRules(e.target.value as Edition)} aria-label="Rules edition">
            <option value="2014">2014</option>
            <option value="2024">2024</option>
          </select>
        )}
      </div>
      <ul className="lib-list lib-scroll">
        {list.slice(0, SHOWN).map((e) => (
          <EntryRow
            key={e.id}
            session={session}
            entry={e}
            open={open === e.id}
            onToggle={() => setOpen(open === e.id ? undefined : e.id)}
          />
        ))}
        {list.length > SHOWN && (
          <li className="muted lib-hint">{list.length - SHOWN} more: type to narrow the list.</li>
        )}
        {list.length === 0 && <li className="muted lib-hint">Nothing matches.</li>}
      </ul>
      <p className="muted lib-hint">
        {category === 'monsters' ? 'Drag a monster onto the map to place it.' : 'Drag onto a creature to give it.'}
      </p>
    </div>
  );
}

function EntryRow({
  session,
  entry,
  open,
  onToggle,
}: Readonly<{ session: Session; entry: Entry; open: boolean; onToggle: () => void }>) {
  return (
    <li
      className={open ? 'lib-row lib-entry on' : 'lib-row lib-entry'}
      draggable
      onDragStart={(e) => startDrag(e, entry.drag)}
    >
      <button className="lib-main" onClick={onToggle} title="Drag onto the map">
        <span className="lib-text">
          <span className="lib-name">{entry.name}</span>
          <span className="lib-sub">{entry.sub}</span>
        </span>
      </button>
      {open && <EntryDetail session={session} entry={entry} />}
    </li>
  );
}

function detailTip(entry: Entry): Tip | undefined {
  const d = entry.drag;
  if (d.kind === 'monster') return monsterTip(gameContent(d.rules).monsters.get(d.id)!);
  if (d.kind === 'spell') return spellTip(gameContent(d.rules).spells.get(d.id)!);
  if (d.kind === 'item') return itemTip(gameContent('2014').items.get(d.id), d.id, false);
  return undefined;
}

function monsterTip(m: Monster): Tip {
  const abilities = ABILITIES.map(
    (a) => `${a.toUpperCase()} ${m.abilities[a]} (${signed(abilityMod(m.abilities[a]))})`,
  );
  return {
    title: m.name,
    subtitle: `CR ${crText(m.cr)} ${m.type ?? ''}`,
    facts: [
      `AC ${m.ac} · HP ${m.hp} · ${m.speed} ft`,
      abilities.join(', '),
      ...m.attacks.map((a) => `${a.name}: ${attackTip(a).facts.slice(1).join(', ')}`),
    ],
    body: '',
  };
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function EntryDetail({ session, entry }: Readonly<{ session: Session; entry: Entry }>) {
  const tip = detailTip(entry);
  const selected = session.selected ? session.tokens.get(session.selected) : undefined;
  return (
    <div className="lib-detail">
      {tip && (
        <>
          <ul className="tip-facts">
            {tip.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {tip.body && <p className="lib-body">{tip.body}</p>}
        </>
      )}
      <div className="lib-actions">
        {entry.drag.kind === 'monster' ? (
          <MonsterButtons session={session} drag={entry.drag} />
        ) : (
          <button
            className="btn small"
            disabled={!selected}
            onClick={() => selected && session.drop(entry.drag, [selected.x, selected.y])}
          >
            {selected ? `Give to ${selected.name}` : 'Select a creature to give it'}
          </button>
        )}
      </div>
    </div>
  );
}

function MonsterButtons({
  session,
  drag,
}: Readonly<{ session: Session; drag: { kind: 'monster'; id: string; rules: Edition } }>) {
  const addToActors = () => {
    const monster = gameContent(drag.rules).monsters.get(drag.id)!;
    const id = uniqueId(monster.name, (x) => session.actors.has(x));
    const token = tokenFromMonster(
      monster,
      { id, name: monster.name, at: [0, 0], rules: drag.rules },
      session.world?.rules,
    );
    session.saveActor(actorFromToken(token, id, 'Monsters'));
  };
  return (
    <>
      <button className="btn small" onClick={() => session.spawn(drag, session.viewCentre())}>
        Place
      </button>
      <button className="btn small" onClick={addToActors}>
        Add to Actors
      </button>
    </>
  );
}
