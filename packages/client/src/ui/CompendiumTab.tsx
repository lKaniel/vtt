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
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Toggle } from './kit/toggle.tsx';
import { SelectField } from './kit/select.tsx';

// The Compendium tab (the GM's, and trusted players' for their own sheets):
// the SRD books, searchable. Drag a monster onto the map to place it; an item,
// spell or feature onto a creature or a character sheet to give it.

const LABEL: Record<Category, string> = {
  monsters: 'Monsters',
  weapons: 'Weapons',
  armor: 'Armour',
  gear: 'Gear',
  spells: 'Spells',
  features: 'Features',
};

const HINT: Record<Category, string> = {
  monsters: 'Drag a monster onto the map to place it.',
  weapons: 'Drag onto a creature or a character sheet to give it.',
  armor: 'Drag onto a creature or a character sheet to give it.',
  gear: 'Drag onto a creature or a character sheet to give it.',
  spells: 'Drag onto a sheet’s spells to teach it, or its inventory for a scroll.',
  features: 'Drag onto a creature or a character sheet to grant it.',
};
/** Rows shown at once; typing narrows the rest. */
const SHOWN = 120;

export function CompendiumTab({ session }: Readonly<{ session: Session }>) {
  const [category, setCategory] = useState<Category>('monsters');
  const [rules, setRules] = useState<Edition>(toEdition(session.world?.rules));
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string>();
  const list = compendium(category, rules, query);
  const editioned = category === 'monsters' || category === 'spells' || category === 'features';
  return (
    <div className="lib">
      <nav className="lib-cats">
        {CATEGORIES.map((c) => (
          <Toggle key={c} pressed={c === category} onPressedChange={() => setCategory(c)}>
            {LABEL[c]}
          </Toggle>
        ))}
      </nav>
      <div className="lib-filter">
        <Input
          className="lib-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${LABEL[category].toLowerCase()}…`}
        />
        {editioned && (
          <SelectField
            value={rules}
            onValueChange={(r) => setRules(r as Edition)}
            aria-label="Rules edition"
            options={[
              { value: '2014', label: '2014' },
              { value: '2024', label: '2024' },
            ]}
          />
        )}
      </div>
      <ul className="lib-list lib-scroll">
        {list.slice(0, SHOWN).map((e) => (
          <EntryRow
            key={e.key}
            session={session}
            entry={e}
            open={open === e.key}
            onToggle={() => setOpen(open === e.key ? undefined : e.key)}
          />
        ))}
        {list.length > SHOWN && (
          <li className="muted lib-hint">{list.length - SHOWN} more: type to narrow the list.</li>
        )}
        {list.length === 0 && <li className="muted lib-hint">Nothing matches.</li>}
      </ul>
      <p className="muted lib-hint">{HINT[category]}</p>
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
      <button className="lib-main" onClick={onToggle} title="Drag onto the map or a character sheet">
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
  if (d.kind === 'feature') return featureEntryTip(d);
  return undefined;
}

function featureEntryTip(d: { id: string; class: string; rules: Edition }): Tip | undefined {
  const feature = gameContent(d.rules)
    .classes.get(d.class)
    ?.features.find((f) => f.id === d.id);
  return feature && { title: feature.name, subtitle: '', facts: [], body: feature.description };
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
          session.isGm() && <MonsterButtons session={session} drag={entry.drag} />
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!selected}
            onClick={() => selected && session.drop(entry.drag, [selected.x, selected.y])}
          >
            {selected ? `Give to ${selected.name}` : 'Select a creature to give it'}
          </Button>
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
      <Button variant="outline" size="sm" onClick={() => session.spawn(drag, session.viewCentre())}>
        Place
      </Button>
      <Button variant="outline" size="sm" onClick={addToActors}>
        Add to Actors
      </Button>
    </>
  );
}
