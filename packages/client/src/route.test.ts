import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, type Route } from './route.ts';

describe('routes', () => {
  it('round-trips every screen through the address bar', () => {
    const routes: Route[] = [
      { name: 'menu' },
      { name: 'setup' },
      { name: 'join', game: 'lost-mine' },
      { name: 'join', game: 'lost-mine', player: 'alice' },
      { name: 'game', game: 'lost-mine' },
      { name: 'play', game: 'lost-mine' },
      { name: 'play' },
      { name: 'create', game: 'lost-mine' },
      { name: 'create', game: 'lost-mine', id: 'vex-1' },
      { name: 'levelup', game: 'lost-mine', id: 'vex-1' },
    ];
    for (const route of routes) expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it('falls back to the main menu, also for the old account screens', () => {
    expect(parseRoute('#/nowhere')).toEqual({ name: 'menu' });
    expect(parseRoute('#/games/')).toEqual({ name: 'menu' });
    expect(parseRoute('#/login')).toEqual({ name: 'menu' });
    expect(parseRoute('#/level/x')).toEqual({ name: 'menu' });
  });
});
