import { randomBytes } from 'node:crypto';
import {
  type Character,
  characterBack,
  characterIssues,
  characterOnMap,
  CharacterSchema,
  freeSquare,
  resolveToken,
} from '@vtt/system-dnd5e';
import { ownersOf, type Player, type Point, uniqueId } from '@vtt/shared';
import { z } from 'zod';
import type { CharacterStore } from '../library/characters.ts';
import type { GameHub } from '../library/game-hub.ts';
import type { GameStore } from '../store/game-store.ts';
import { HttpError, parseBody, send } from './http-json.ts';
import type { GameCall } from './lobby-api.ts';
import { homebrewFor, withCurrentHomebrew } from '../library/roster-homebrew.ts';

// What a player does for themselves at a game, as JSON over HTTP: their
// characters there (made with the character creator, levelled up, brought
// onto the map), the GM's homebrew classes they may build with, and their
// key for Claude. All under /api/games/<id>/, as the player this browser
// joined the game as.

interface Deps {
  characters: CharacterStore;
  hub: GameHub;
}

/** What a client sends for a character: everything but whose it is and its id. */
const CharacterInput = CharacterSchema.omit({ id: true, owner: true, game: true });
const BringInput = z.object({ character: z.string() });

const SUBS = ['characters', 'homebrew', 'bring', 'mcp-key'];

type Seated = GameCall & { seat: Player };

export class CharacterRoutes {
  constructor(private deps: Deps) {}

  handles(sub: string): boolean {
    return SUBS.includes(sub);
  }

  serve(g: GameCall): Promise<void> {
    if (!g.seat) throw new HttpError(401, 'Join the game first.');
    const seated = g as Seated;
    switch (g.call.parts[2]) {
      case 'characters':
        return this.characters(seated);
      case 'homebrew':
        return this.homebrew(seated);
      case 'bring':
        return this.bring(seated);
      default:
        return this.mcpKey(seated);
    }
  }

  private async store(g: GameCall): Promise<GameStore> {
    return (await this.deps.hub.open(g.info.id)).store;
  }

  private async homebrew(g: Seated): Promise<void> {
    if (g.call.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    send(g.call.res, 200, { classes: [...homebrewFor(await this.store(g), g.seat).values()] });
  }

  private async characters(g: Seated): Promise<void> {
    const { call, info, seat } = g;
    const id = call.parts[3];
    if (call.method === 'GET' && !id) {
      send(call.res, 200, { characters: this.deps.characters.listFor(info.id, seat.id) });
      return;
    }
    if (call.method === 'POST' && !id) return this.save(g, this.newId());
    const owned = id && this.deps.characters.owned(id, info.id, seat.id);
    if (!owned) throw new HttpError(404, 'No such character.');
    if (call.method === 'PUT') return this.save(g, owned.id, owned);
    if (call.method !== 'DELETE') throw new HttpError(405, 'Method not allowed.');
    await this.deps.characters.remove(owned.id);
    send(call.res, 200, {});
  }

  /** A fresh id from the character's name, unique among characters and the loaded games' actors. */
  private newId(): (name: string) => string {
    const suffix = randomBytes(2).toString('hex');
    const { characters, hub } = this.deps;
    const taken = (id: string) => characters.has(id) || hub.running().some(({ store }) => store.actors.has(id));
    return (name) => uniqueId(`${name} ${suffix}`, taken);
  }

  private async save(g: Seated, id: string | ((name: string) => string), previous?: Character): Promise<void> {
    const input = await parseBody(g.call.req, CharacterInput);
    const store = await this.store(g);
    const built: Character = {
      ...input,
      id: typeof id === 'string' ? id : id(input.name),
      owner: g.seat.id,
      game: g.info.id,
    };
    const character = built.homebrew.length ? withCurrentHomebrew(built, homebrewFor(store, g.seat)) : built;
    const issues = characterIssues(character);
    if (issues.length) throw new HttpError(400, issues[0]!, issues);
    await this.deps.characters.save(character);
    updateOnMap(store, character, previous);
    send(g.call.res, 200, { character });
  }

  /** Brings one of your characters onto the map as a linked actor you own (or updates the one there). */
  private async bring(g: Seated): Promise<void> {
    if (g.call.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const { character: cid } = await parseBody(g.call.req, BringInput);
    const character = this.deps.characters.owned(cid, g.info.id, g.seat.id);
    if (!character) throw new HttpError(404, 'No such character.');
    place(await this.store(g), character);
    send(g.call.res, 200, {});
  }

  /** Your key for Claude at this game: whether you have one, a new one (shown once), or none. */
  private async mcpKey({ call, info, seat }: Seated): Promise<void> {
    const access = this.deps.hub.access;
    if (call.method === 'GET') {
      send(call.res, 200, { has: access.hasMcpKey(info.id, seat.id) });
      return;
    }
    if (call.method === 'POST') {
      send(call.res, 200, { key: await access.newMcpKey(info.id, seat.id) });
      return;
    }
    if (call.method !== 'DELETE') throw new HttpError(405, 'Method not allowed.');
    await access.dropMcpKey(info.id, seat.id);
    send(call.res, 200, {});
  }
}

/** A saved (or levelled-up) character's tokens take its new build, keeping their play state and look. */
function updateOnMap(store: GameStore, character: Character, previous: Character | undefined): void {
  for (const scene of store.sceneIds()) {
    store.inScene(scene, () => {
      const token = store.tokens.get(character.id);
      if (token) store.setToken(characterOnMap(character, token, [token.x, token.y], previous));
    });
  }
}

/**
 * Puts a character on the map as a linked actor the player owns. A token already there, or the actor
 * when its token left this scene, is kept as the table made it (the GM's edits survive the player
 * entering again); saving the character is what updates it.
 */
function place(store: GameStore, c: Character): void {
  const existing = store.tokens.get(c.id);
  if (existing && !ownersOf(existing).includes(c.owner)) {
    throw new HttpError(409, 'A creature on the map already uses that name.');
  }
  if (existing) {
    store.setToken(characterBack(c, existing));
    return;
  }
  const taken: Point[] = [...store.tokens.values()].map((t) => [t.x, t.y]);
  const at = freeSquare(store.world.start, taken, store.world.gridSize);
  const actor = store.actors.get(c.id);
  const fromActor = actor && resolveToken({ id: c.id, x: at[0], y: at[1], actor: c.id, linked: true }, actor).token;
  store.setToken(fromActor ? characterBack(c, fromActor) : characterOnMap(c, undefined, at));
}
