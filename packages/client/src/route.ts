// The screen the app shows, kept in the address bar's #hash so a reload or
// the back button lands on the same screen.

export type Route =
  /** The games on this server, and the way to Setup. */
  | { name: 'menu' }
  /** Setup (the admin password): making, importing and deleting games. */
  | { name: 'setup' }
  /** A game's join screen: pick your player (`player`, from an invite link, picked already). */
  | { name: 'join'; game: string; player?: string }
  /** A game's page: entering it, your characters, and for its GM the players. */
  | { name: 'game'; game: string }
  /** The character creator at a game: a new character, or `id` to edit one. */
  | { name: 'create'; game: string; id?: string }
  | { name: 'levelup'; game: string; id: string }
  /** At the table: `game`, or the home game. */
  | { name: 'play'; game?: string };

const dec = decodeURIComponent;

/** Routes by their first part, given the rest. */
const PARSE: Record<string, (rest: string[]) => Route | undefined> = {
  setup: () => ({ name: 'setup' }),
  join: ([game, player]) => {
    if (!game) return undefined;
    return player ? { name: 'join', game: dec(game), player: dec(player) } : { name: 'join', game: dec(game) };
  },
  games: ([game]) => (game ? { name: 'game', game: dec(game) } : undefined),
  create: ([game]) => (game ? { name: 'create', game: dec(game) } : undefined),
  edit: ([game, id]) => (game && id ? { name: 'create', game: dec(game), id: dec(id) } : undefined),
  level: ([game, id]) => (game && id ? { name: 'levelup', game: dec(game), id: dec(id) } : undefined),
  play: ([game]) => (game ? { name: 'play', game: dec(game) } : { name: 'play' }),
};

export function parseRoute(hash: string): Route {
  const [name = '', ...rest] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return PARSE[name]?.(rest) ?? { name: 'menu' };
}

const enc = encodeURIComponent;

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/';
    case 'setup':
      return '#/setup';
    case 'join':
      return route.player ? `#/join/${enc(route.game)}/${enc(route.player)}` : `#/join/${enc(route.game)}`;
    case 'game':
      return `#/games/${enc(route.game)}`;
    case 'create':
      return route.id ? `#/edit/${enc(route.game)}/${enc(route.id)}` : `#/create/${enc(route.game)}`;
    case 'levelup':
      return `#/level/${enc(route.game)}/${enc(route.id)}`;
    case 'play':
      return route.game ? `#/play/${enc(route.game)}` : '#/play';
  }
}
