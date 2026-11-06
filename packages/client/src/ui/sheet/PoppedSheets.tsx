import { useState, useSyncExternalStore } from 'react';
import { Popouts } from '../../popouts.ts';
import type { Session } from '../../session/session.ts';
import { CharacterSheet, PoppedSheet } from './CharacterSheet.tsx';
import { PopOutWindow } from '../PopOutWindow.tsx';

/** The sheet open over the map, and every sheet popped out of it into a window of its own. */
export function Sheets({ session }: Readonly<{ session: Session }>) {
  const [popouts] = useState(() => new Popouts());
  return (
    <>
      <CharacterSheet session={session} onPopOut={(t) => popouts.open(t, t.edit)} />
      <PoppedSheets session={session} popouts={popouts} />
    </>
  );
}

function PoppedSheets({ session, popouts }: Readonly<{ session: Session; popouts: Popouts }>) {
  const list = useSyncExternalStore(popouts.subscribe, () => popouts.list);
  return list.map((target) => {
    const name = (target.kind === 'token' ? session.tokens.get(target.id) : session.character.readActor(target.id))
      ?.name;
    const controls = { setEdit: (edit: boolean) => popouts.setEdit(target, edit), close: () => popouts.close(target) };
    return (
      <PopOutWindow key={`${target.kind}:${target.id}`} title={name ?? 'Sheet'} onClose={controls.close}>
        <PoppedSheet session={session} target={target} controls={controls} />
      </PopOutWindow>
    );
  });
}
