import { toEdition } from '@vtt/system-dnd5e';
import { useCallback, useEffect, useState } from 'react';
import { parseRoute, routeHash, type Route } from '../route.ts';
import { api, type SessionInfo } from '../server-api.ts';
import { CharacterCreator } from './CharacterCreator.tsx';
import { GamePage } from './GamePage.tsx';
import { GameScreen } from './GameScreen.tsx';
import { LevelUpScreen } from './LevelUpScreen.tsx';
import { SetupScreen, useLoad } from './LobbyScreens.tsx';
import { JoinScreen, MainMenu } from './MenuScreens.tsx';

/** The route in the address bar, and a way to go somewhere else. */
function useRoute(): [Route, (to: Route) => void] {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((to: Route) => {
    location.hash = routeHash(to);
    setRoute(to);
  }, []);
  return [route, go];
}

/** Whether this browser may use Setup, and the home game; refreshed on demand. */
function useServer() {
  const [info, setInfo] = useState<SessionInfo>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(
    () =>
      api.session().then(
        (next) => {
          setInfo(next);
          setError(undefined);
        },
        (e: unknown) => setError((e as Error).message),
      ),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { info, error, refresh };
}

export function App() {
  const [route, go] = useRoute();
  const { info, error, refresh } = useServer();
  switch (route.name) {
    case 'setup':
      return <SetupScreen info={info} refresh={refresh} go={go} />;
    case 'join':
      return <JoinScreen game={route.game} player={route.player} go={go} />;
    case 'game':
      return <GamePage key={route.game} game={route.game} admin={!!info?.admin} go={go} />;
    case 'create':
    case 'levelup':
      return <CharacterRoute key={`${route.game}/${route.id ?? ''}`} route={route} go={go} />;
    case 'play':
      return <PlayRoute game={route.game ?? info?.home?.id} go={go} />;
    default:
      return <MainMenu info={info} error={error} go={go} />;
  }
}

/** At the table; leaving goes back to the game's page. */
function PlayRoute({ game, go }: Readonly<{ game?: string; go: (to: Route) => void }>) {
  const leave = () => go(game ? { name: 'game', game } : { name: 'menu' });
  return <GameScreen key={game ?? ''} gameId={game} onLeave={leave} />;
}

type CharacterRouteOf = Extract<Route, { name: 'create' | 'levelup' }>;

/** The character creator or level-up for a character at a game, once the game and your characters there load. */
function CharacterRoute({ route, go }: Readonly<{ route: CharacterRouteOf; go: (to: Route) => void }>) {
  const { game: id } = route;
  const load = useCallback(async () => ({ game: await api.game(id), characters: await api.characters(id) }), [id]);
  const { data, error } = useLoad(load);
  const back = () => go({ name: 'game', game: id });
  if (error) return <p className="menu-error">{error}</p>;
  if (!data?.game.me) return null;
  const character = route.id ? data.characters.find((c) => c.id === route.id) : undefined;
  if (route.name === 'levelup') {
    return character ? <LevelUpScreen game={id} character={character} onDone={back} onCancel={back} /> : null;
  }
  return (
    <CharacterCreator
      game={id}
      owner={data.game.me}
      rules={toEdition(data.game.rules)}
      initial={character}
      onDone={back}
      onCancel={back}
    />
  );
}
