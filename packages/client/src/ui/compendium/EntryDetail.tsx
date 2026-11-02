import { ABILITIES, abilityMod, actorFromToken, type Edition, type Monster, tokenFromMonster } from '@vtt/system-dnd5e';
import { uniqueId } from '@vtt/shared';
import { crText, type Entry } from '../../compendium.ts';
import { gameContent } from '../../content.ts';
import { t } from '../../i18n/index.ts';
import type { Session } from '../../session.ts';
import { attackTip, itemTip, spellTip, type Tip } from '../../tooltip.ts';
import { Button } from '../kit/button.tsx';

// What a Compendium entry says when opened: its facts and text, and the
// buttons that do what dragging it would (place a monster, give the rest to
// the selected creature).

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

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

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

export function EntryDetail({ session, entry }: Readonly<{ session: Session; entry: Entry }>) {
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
            onClick={() => selected && session.drops.onMap(entry.drag, [selected.x, selected.y])}
          >
            {selected ? t('compendium.giveTo', { name: selected.name }) : t('compendium.selectToGive')}
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
      <Button variant="outline" size="sm" onClick={() => session.drops.spawn(drag, session.editor.viewCentre())}>
        {t('compendium.place')}
      </Button>
      <Button variant="outline" size="sm" onClick={addToActors}>
        {t('compendium.addToActors')}
      </Button>
    </>
  );
}
