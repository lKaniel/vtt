import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, type Route } from './route.ts';

describe('routes', () => {
  it('round-trips every screen through the address bar', () => {
    const routes: Route[] = [
      { name: 'menu' },
      { name: 'games' },
      { name: 'game', id: 'lost-mine' },
      { name: 'invite', code: 'aB3_x-9' },
      { name: 'play', game: 'lost-mine' },
      { name: 'play' },
      { name: 'account' },
      { name: 'create' },
      { name: 'create', id: 'vex-1' },
      { name: 'levelup', id: 'vex-1' },
    ];
    for (const route of routes) expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it('falls back to the main menu', () => {
    expect(parseRoute('#/nowhere')).toEqual({ name: 'menu' });
    expect(parseRoute('#/games/')).toEqual({ name: 'games' });
  });
});
