import type { Doc } from '@vtt/core';
import type { Session } from '../session.ts';
import { startDrag } from './ActorsTab.tsx';
import { Button } from './kit/button.tsx';

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const shared = (doc: Doc) => {
  const level = (doc.ownership as { default?: string } | undefined)?.default;
  return level === 'observer' || level === 'owner';
};

/**
 * Journal entries: handouts and the GM's notes. Everyone opens the entries
 * they may see; the GM adds them, shares them with the players (their pages
 * then show), shows one on every player's screen, and drags one onto the map
 * to pin a note that opens it.
 */
export function JournalTab({ session }: Readonly<{ session: Session }>) {
  const gm = session.isGm();
  const entries = session.docs.all('journals').sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return (
    <div className="scenes-tab">
      {gm && (
        <Button variant="outline" size="sm" onClick={() => session.createEntry('journal')}>
          New entry
        </Button>
      )}
      <ul className="rows">
        {entries.map((doc) => (
          <li
            key={doc.id}
            className="scene-row"
            draggable={gm}
            onDragStart={(e) => startDrag(e, { kind: 'journal', id: doc.id, name: nameOf(doc) })}
            title={gm ? 'Drag onto the map to pin a note' : undefined}
          >
            <Button variant="link" onClick={() => session.openJournal(doc.id)}>
              {nameOf(doc)}
            </Button>
            {gm && (
              <span className="row-actions">
                <Button
                  variant="outline"
                  size="sm"
                  title={shared(doc) ? 'Players can read it: hide it again' : 'Let the players read it'}
                  onClick={() =>
                    session.patchEntry('journals', doc.id, {
                      ownership: shared(doc) ? null : { default: 'observer' },
                    })
                  }
                >
                  {shared(doc) ? 'Shared' : 'Share'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  title="Open it on every player's screen"
                  onClick={() => session.showJournal(doc.id)}
                >
                  Show
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!entries.length && <p className="muted">{gm ? 'No entries yet.' : 'Nothing has been shared with you yet.'}</p>}
    </div>
  );
}
