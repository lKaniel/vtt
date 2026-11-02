import { abilityScores, type Character, characterIssues, characterMaxHp } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { characterSummary } from '../content/creator.ts';
import { t } from '../i18n/index.ts';
import type { Route } from '../route.ts';
import { api } from '../server-api.ts';
import { Button } from './kit/button.tsx';

/** Your characters at a game, on its page: made with the creator, levelled up, deleted. */
export function CharactersPanel({
  game,
  characters,
  go,
  refresh,
}: Readonly<{ game: string; characters: Character[]; go: (to: Route) => void; refresh: () => void }>) {
  const [picked, setPicked] = useState(characters[0]?.id);
  const chosen = characters.find((c) => c.id === picked) ?? characters[0];

  const remove = async (c: Character) => {
    if (!confirm(t('characters.deleteAsk', { name: c.name }))) return;
    await api.deleteCharacter(game, c.id);
    refresh();
  };

  return (
    <section className="frame lobby-members" data-slot="characters">
      <h2 className="lobby-heading">{t('characters.title')}</h2>
      <div className="roster">
        {characters.map((c) => (
          <RosterCard key={c.id} c={c} on={c.id === chosen?.id} onPick={() => setPicked(c.id)} />
        ))}
        <button className="roster-card roster-new" onClick={() => go({ name: 'create', game })}>
          <span className="roster-plus">+</span>
          <span>{t('characters.create')}</span>
        </button>
      </div>
      {chosen && <ChosenBar game={game} c={chosen} go={go} onDelete={() => void remove(chosen)} />}
    </section>
  );
}

function RosterCard({ c, on, onPick }: Readonly<{ c: Character; on: boolean; onPick: () => void }>) {
  const scores = abilityScores(c);
  return (
    <button className={on ? 'roster-card on' : 'roster-card'} onClick={onPick} onDoubleClick={onPick}>
      <span
        className="roster-face"
        style={{ backgroundImage: `url(${c.img ?? '/art/ui/portrait-default.webp'})`, borderColor: c.color }}
      />
      <span className="roster-name">{c.name}</span>
      <span className="roster-line">{characterSummary(c)}</span>
      <span className="roster-stats">
        <span>HP {characterMaxHp(c)}</span>
        <span>STR {scores.str}</span>
        <span>DEX {scores.dex}</span>
        <span>CON {scores.con}</span>
      </span>
      <span className="roster-rules">{c.rules}</span>
    </button>
  );
}

function ChosenBar({
  game,
  c,
  go,
  onDelete,
}: Readonly<{ game: string; c: Character; go: (to: Route) => void; onDelete: () => void }>) {
  const broken = characterIssues(c);
  return (
    <div className="chosen">
      <div className="chosen-who">
        <strong>{c.name}</strong>
        <span>{characterSummary(c)}</span>
        {broken.length > 0 && <span className="chosen-warn">{broken[0]}</span>}
      </div>
      <Button variant="destructive" onClick={onDelete}>
        {t('characters.delete')}
      </Button>
      <Button variant="outline" onClick={() => go({ name: 'create', game, id: c.id })}>
        {t('characters.edit')}
      </Button>
      <Button variant="outline" disabled={c.level >= 20} onClick={() => go({ name: 'levelup', game, id: c.id })}>
        {t('characters.levelUp')}
      </Button>
    </div>
  );
}
