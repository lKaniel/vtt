// The screen the app shows, kept in the address bar's #hash so a reload or
// the back button lands on the same screen.

export type Route =
  | { name: 'menu' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'account' }
  /** The character creator: a new character, or `id` to edit one. */
  | { name: 'create'; id?: string }
  | { name: 'levelup'; id: string }
  /** The world's fixed seats, for joining without an account. */
  | { name: 'seats' }
  | { name: 'play' };

const SIMPLE = ['login', 'register', 'account', 'seats', 'play'] as const;

export function parseRoute(hash: string): Route {
  const [name, id] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'create') return { name: 'create' };
  if (name === 'edit' && id) return { name: 'create', id };
  if (name === 'level' && id) return { name: 'levelup', id };
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
    default:
      return `#/${route.name}`;
  }
}
