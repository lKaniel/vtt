import { uniqueId, type Actor, type TokenView } from '@vtt/shared';
import { useState } from 'react';
import { DRAG_TYPE, type DragPayload } from '../drops.ts';
import type { Session } from '../session.ts';
import { Face, HpBar } from './Portrait.tsx';

// The GM's Actors tab: every creature on the map, and the Actors list of
// creatures ready to be placed. Drag an actor onto the map to place a copy.

export function startDrag(e: React.DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

const matches = (name: string, query: string) => name.toLowerCase().includes(query.trim().toLowerCase());

function subtitle(t: Pick<TokenView, 'monster' | 'stats'>): string {
  const cls = t.stats?.class ? [t.stats.class, t.stats.level].filter(Boolean).join(' ') : t.monster;
  return [cls, t.stats?.rules && `${t.stats.rules} rules`].filter(Boolean).join(' · ');
}

export function ActorsTab({ session }: Readonly<{ session: Session }>) {
  const [query, setQuery] = useState('');
  const tokens = [...session.tokens.values()].filter((t) => matches(t.name, query));
  const actors = [...session.actors.values()].filter((a) => matches(a.name, query));
  const newActor = () => {
    const id = uniqueId('New actor', (x) => session.actors.has(x));
    session.saveActor({
      id,
      name: 'New actor',
      size: 1,
      color: '#8a6a4a',
      speed: 30,
      controllers: [],
      darkvision: 0,
      hidden: false,
    });
    session.openSheet({ kind: 'actor', id }, true);
  };
  return (
    <div className="lib">
      <input className="lib-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
      <label className="ed-check lib-hidden">
        <input
          type="checkbox"
          checked={session.spawnHidden}
          onChange={(e) => session.setSpawnHidden(e.target.checked)}
        />
        <span>Place new creatures hidden</span>
      </label>
      <div className="lib-scroll">
        <h4>On the map</h4>
        <ul className="lib-list">
          {tokens.map((t) => (
            <TokenRow key={t.id} session={session} token={t} />
          ))}
        </ul>
        <h4 className="lib-heading">
          Actors
          <button className="btn small" onClick={newActor}>
            New
          </button>
        </h4>
        {actors.length === 0 && (
          <p className="muted lib-hint">Save a token as an actor, or add monsters from the Compendium.</p>
        )}
        <ActorFolders session={session} actors={actors} />
      </div>
      <p className="muted lib-hint">Drag an actor onto the map to place a copy. Double-click a token to edit it.</p>
    </div>
  );
}

function TokenRow({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const show = () => {
    session.select(token.id);
    session.focus([token.x, token.y]);
  };
  return (
    <li className={token.id === session.selected ? 'lib-row on' : 'lib-row'}>
      <button
        className="lib-main"
        onClick={show}
        onDoubleClick={() => session.openSheet({ kind: 'token', id: token.id }, true)}
      >
        <Face token={token} className="lib-face" />
        <span className="lib-text">
          <span className="lib-name">
            {token.name}
            {token.hidden && <span className="lib-tag">hidden</span>}
          </span>
          <span className="lib-sub">{subtitle(token) || 'Token'}</span>
          <HpBar token={token} showLabel={false} />
        </span>
      </button>
      <button
        className="lib-icon"
        title={token.hidden ? 'Reveal to players' : 'Hide from players'}
        onClick={() => session.editToken(token.id, { hidden: !token.hidden })}
      >
        {token.hidden ? '◌' : '◉'}
      </button>
      <button
        className="lib-icon"
        title="Edit"
        onClick={() => session.openSheet({ kind: 'token', id: token.id }, true)}
      >
        ✎
      </button>
    </li>
  );
}

function ActorFolders({ session, actors }: Readonly<{ session: Session; actors: Actor[] }>) {
  const folders = new Map<string, Actor[]>();
  for (const a of [...actors].sort((x, y) => x.name.localeCompare(y.name))) {
    const key = a.folder ?? '';
    folders.set(key, [...(folders.get(key) ?? []), a]);
  }
  // Folders by name, then the actors outside any folder.
  const names = [...folders.keys()].sort((a, b) => Number(!a) - Number(!b) || a.localeCompare(b));
  return names.map((folder) => {
    const list = (
      <ul className="lib-list">
        {folders.get(folder)!.map((a) => (
          <ActorRow key={a.id} session={session} actor={a} />
        ))}
      </ul>
    );
    // A details element without a summary would show the browser's own "Details" label.
    if (!folder) return <div key="-">{list}</div>;
    return (
      <details key={folder} className="lib-folder" open>
        <summary>{folder}</summary>
        {list}
      </details>
    );
  });
}

function ActorRow({ session, actor }: Readonly<{ session: Session; actor: Actor }>) {
  const edit = () => session.openSheet({ kind: 'actor', id: actor.id }, true);
  return (
    <li className="lib-row" draggable onDragStart={(e) => startDrag(e, { kind: 'actor', id: actor.id })}>
      <button className="lib-main" onClick={edit} title="Drag onto the map to place a copy">
        <Face token={{ ...actor, x: 0, y: 0 }} className="lib-face" />
        <span className="lib-text">
          <span className="lib-name">{actor.name}</span>
          <span className="lib-sub">{subtitle(actor) || 'Actor'}</span>
        </span>
      </button>
      <button
        className="lib-icon"
        title="Place at the centre of the screen"
        onClick={() => session.spawn({ kind: 'actor', id: actor.id }, session.viewCentre())}
      >
        ＋
      </button>
      <button className="lib-icon" title="Edit" onClick={edit}>
        ✎
      </button>
    </li>
  );
}
