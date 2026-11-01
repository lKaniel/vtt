import { toEdition, type Character } from '@vtt/system-dnd5e';
import { useCallback, useEffect, useState } from 'react';
import { api, type SessionInfo } from '../account-api.ts';
import { parseRoute, routeHash, type Route } from '../route.ts';
import { AccountScreen } from './AccountScreen.tsx';
import { CharacterCreator } from './CharacterCreator.tsx';
import { GameScreen } from './GameScreen.tsx';
import { LevelUpScreen } from './LevelUpScreen.tsx';
import { GamePage } from './GamePage.tsx';
import { GamesScreen, InviteScreen } from './LobbyScreens.tsx';
import { AuthScreen, MainMenu, SeatsScreen } from './MenuScreens.tsx';
import { PENDING_INVITE } from '../lobby.ts';

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

interface Loaded {
  info: SessionInfo;
  characters: Character[];
}

async function loadAccount(): Promise<Loaded> {
  const info = await api.session();
  return { info, characters: info.account ? await api.characters() : [] };
}

/** Who is signed in and their characters, refreshed on demand. */
function useAccount() {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const apply = useCallback((p: Promise<Loaded>) => {
    return p.then(
      (next) => {
        setLoaded(next);
        setError(undefined);
      },
      (e: unknown) => setError((e as Error).message),
    );
  }, []);
  useEffect(() => {
    void apply(loadAccount());
  }, [apply]);
  const refresh = useCallback(() => apply(loadAccount()), [apply]);
  return { info: loaded?.info, characters: loaded?.characters ?? [], error, refresh };
}

export function App() {
  const [route, go] = useRoute();
  const account = useAccount();
  const [seat, setSeat] = useState(() => new URLSearchParams(location.search).get('player') ?? undefined);

  const leaveSeat = () => {
    const url = new URL(location.href);
    url.searchParams.delete('player');
    history.replaceState(null, '', url);
    setSeat(undefined);
    go(account.info?.account ? { name: 'games' } : { name: 'menu' });
  };

  if (seat) return <GameScreen playerId={seat} onLeave={leaveSeat} />;
  return <Screen route={route} go={go} account={account} onSeat={setSeat} />;
}

interface ScreenProps {
  route: Route;
  go: (to: Route) => void;
  account: ReturnType<typeof useAccount>;
  onSeat: (id: string) => void;
}

/** Where to go once signed in: an invite that was waiting, else the lobby. */
function afterSignIn(): Route {
  const code = sessionStorage.getItem(PENDING_INVITE);
  return code ? { name: 'invite', code } : { name: 'games' };
}

function Screen({ route, go, account, onSeat }: Readonly<ScreenProps>) {
  const { info, refresh } = account;
  const signedIn = !!info?.account;
  const toLobby = () => {
    void refresh();
    go(afterSignIn());
  };
  switch (route.name) {
    case 'login':
    case 'register':
      return <AuthScreen mode={route.name} go={go} onSignedIn={toLobby} />;
    case 'seats':
      return <SeatsScreen go={go} onJoin={onSeat} />;
    case 'invite':
      return <InviteScreen code={route.code} signedIn={signedIn} go={go} />;
    case 'play':
      return (
        <GameScreen
          key={route.game ?? ''}
          gameId={route.game}
          onLeave={() => go(route.game ? { name: 'game', id: route.game } : { name: 'games' })}
        />
      );
    case 'menu':
      return <MainMenu info={info} error={account.error} go={go} characters={account.characters.length} />;
    default:
      if (!signedIn) return <MainMenu info={info} error={account.error} go={go} />;
      return <AccountRoutes route={route} go={go} account={account} onSaved={() => go({ name: 'account' })} />;
  }
}

function AccountRoutes({
  route,
  go,
  account,
  onSaved,
}: Readonly<Omit<ScreenProps, 'onSeat'> & { onSaved: () => void }>) {
  const { info, characters, refresh } = account;
  const me = info!.account!;
  const saved = () => {
    void refresh();
    onSaved();
  };
  if (route.name === 'games') return <GamesScreen account={me} go={go} />;
  if (route.name === 'game') return <GamePage id={route.id} account={me} characters={characters} go={go} />;
  if (route.name === 'create') {
    const editing = route.id ? characters.find((c) => c.id === route.id) : undefined;
    return (
      <CharacterCreator
        key={route.id ?? 'new'}
        owner={me.id}
        rules={toEdition(info!.home?.rules)}
        initial={editing}
        onDone={saved}
        onCancel={() => go({ name: 'account' })}
      />
    );
  }
  if (route.name === 'levelup') {
    const c = characters.find((x) => x.id === route.id);
    if (c) return <LevelUpScreen character={c} onDone={saved} onCancel={() => go({ name: 'account' })} />;
  }
  return <AccountScreen info={info!} characters={characters} go={go} refresh={refresh} />;
}
