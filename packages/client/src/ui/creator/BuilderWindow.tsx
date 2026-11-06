import { type Character, toEdition } from '@vtt/system-dnd5e';
import { useCallback, useEffect, useState } from 'react';
import { t } from '../../i18n/index.ts';
import { api } from '../../server-api.ts';
import type { Session } from '../../session/session.ts';
import type { Building } from '../../session/session-builder.ts';
import { CharacterCreator } from '../CharacterCreator.tsx';
import { LevelUpScreen } from '../LevelUpScreen.tsx';
import { Window } from '../kit/window.tsx';
import type { Size } from '../kit/window-stack.ts';

// The character creator and the level up of characters made with it, in a
// window over the table (as on the game's page, which they used to need).
// A new character is brought onto the map at once, so it is an actor you
// own: your character, in the Actors tab and the party.

/** Your characters at the game made with the creator, loaded once and again after a save. */
export function useBuiltCharacters(session: Session): { list?: Character[]; reload: () => void } {
  const game = session.gameId;
  const [list, setList] = useState<Character[]>();
  const reload = useCallback(() => {
    if (game) api.characters(game).then(setList, () => setList([]));
  }, [game]);
  useEffect(reload, [reload]);
  return { list, reload };
}

const place = (view: Size) => {
  const w = Math.min(1180, view.width - 40);
  const h = Math.min(820, view.height - 40);
  return { x: Math.max(20, (view.width - w) / 2), y: Math.max(20, (view.height - h) / 2), w, h };
};

/** The open creator or level up, if any. */
export function BuilderWindow({ session }: Readonly<{ session: Session }>) {
  const building = session.builder.current;
  if (!building) return null;
  return <Builder key={JSON.stringify(building)} session={session} building={building} />;
}

function titleOf(building: Building, character?: Character): string {
  if (building.mode === 'create') return t('builder.title.create');
  return t(building.mode === 'edit' ? 'builder.title.edit' : 'builder.title.levelup', { name: character?.name ?? '' });
}

function Builder({ session, building }: Readonly<{ session: Session; building: Building }>) {
  const { list } = useBuiltCharacters(session);
  const game = session.gameId;
  const character = building.mode === 'create' ? undefined : list?.find((c) => c.id === building.id);
  const close = () => session.builder.close();
  const created = (saved: Character) => {
    close();
    if (game && building.mode === 'create') void api.bring(game, saved.id);
  };
  return (
    <Window
      id="builder"
      kind="builder"
      initial={place}
      role="dialog"
      title={titleOf(building, character)}
      onClose={close}
      resizable
      bodyClassName="overflow-hidden [&_.cc]:h-full [&_.cc]:min-h-0 [&_.cc]:p-3 [&_.cc::before]:hidden [&_.cc-head_.menu-title]:hidden [&_.levelup]:h-full [&_.levelup]:min-h-0 [&_.levelup]:p-3 [&_.levelup::before]:hidden"
    >
      <BuilderBody
        session={session}
        building={building}
        character={character}
        loaded={!!list}
        onDone={created}
        onCancel={close}
      />
    </Window>
  );
}

function BuilderBody({
  session,
  building,
  character,
  loaded,
  onDone,
  onCancel,
}: Readonly<{
  session: Session;
  building: Building;
  character?: Character;
  loaded: boolean;
  onDone: (saved: Character) => void;
  onCancel: () => void;
}>) {
  const game = session.gameId;
  const you = session.you;
  if (!game || !you) return <p className="muted p-3">{t('builder.noGame')}</p>;
  if (building.mode !== 'create' && !character) return <p className="muted p-3">{t('builder.loading')}</p>;
  if (building.mode === 'levelup' && character) {
    return <LevelUpScreen game={game} character={character} onDone={() => onDone(character)} onCancel={onCancel} />;
  }
  if (!loaded && building.mode !== 'create') return null;
  return (
    <CharacterCreator
      game={game}
      owner={you.id}
      rules={toEdition(session.world?.rules)}
      initial={character}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
}
