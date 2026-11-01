// The screen the app shows, kept in the address bar's #hash so a reload or
// the back button lands on the same screen.

export type Route =
  | { name: 'menu' }
  | { name: 'login' }
  | { name: 'register' }
  /** The lobby: your games, making one, joining by code. */
  | { name: 'games' }
  /** One game's page: members, invite link, entering it. */
  | { name: 'game'; id: string }
  /** An invite link someone shared. */
  | { name: 'invite'; code: string }
  /** The roster: your characters. */
  | { name: 'account' }
  /** The character creator: a new character, or `id` to edit one. */
  | { name: 'create'; id?: string }
  | { name: 'levelup'; id: string }
  /** The home game's fixed seats, for joining without an account. */
  | { name: 'seats' }
  /** At the table: `game`, or the home game. */
  | { name: 'play'; game?: string };

const SIMPLE = ['login', 'register', 'account', 'seats', 'games'] as const;

/** Routes that name something: #/<prefix>/<id>. */
const NAMED: Record<string, (id: string) => Route> = {
  edit: (id) => ({ name: 'create', id }),
  level: (id) => ({ name: 'levelup', id }),
  games: (id) => ({ name: 'game', id }),
  invite: (code) => ({ name: 'invite', code }),
  play: (game) => ({ name: 'play', game }),
};

export function parseRoute(hash: string): Route {
  const [name = '', id] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'create') return { name: 'create' };
  if (name === 'play' && !id) return { name: 'play' };
  const named = id ? NAMED[name] : undefined;
  if (named) return named(decodeURIComponent(id!));
  const simple = SIMPLE.find((s) => s === name);
  return simple ? { name: simple } : { name: 'menu' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/';
    case 'create':
      return route.id ? `#/edit/${route.id}` : '#/create';
    case 'levelup':
      return `#/level/${route.id}`;
    case 'game':
      return `#/games/${route.id}`;
    case 'invite':
      return `#/invite/${route.code}`;
    case 'play':
      return route.game ? `#/play/${route.game}` : '#/play';
    default:
      return `#/${route.name}`;
  }
}
