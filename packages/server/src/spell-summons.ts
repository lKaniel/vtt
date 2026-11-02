import { gridKind, type Lattice, placeToken, type Point, sceneLattice } from '@vtt/shared';
import {
  abilityMod,
  joinCombat,
  type Spell,
  spellCreature,
  type SummonCast,
  summonCount,
  type Token,
  TokenSchema,
} from '@vtt/system-dnd5e';
import type { CastRequest } from './spell-actions.ts';
import { Refusal, type Fighter, type Table } from './table.ts';

// Summoning spells: the creatures appear on free squares around the aimed
// point, on the caster's side, and join the fight when they get their own turn.

/** Brings what the spell summons next to the aimed point, in the fight when they get their own turn. */
export function summon(
  table: Table,
  caster: Fighter,
  spell: Spell,
  req: Pick<CastRequest, 'summon' | 'point'> & { slot: number },
): Token[] {
  const options = spell.summon!.options;
  const choice = options.find((o) => o.monster === req.summon) ?? (options.length === 1 ? options[0] : undefined);
  if (!choice) throw new Refusal(`Pick what ${spell.name} summons: ${options.map((o) => o.monster).join(', ')}`);
  const cast = castOf(table, caster, spell, req.slot);
  const built = spellCreature(choice, cast);
  const monster = built ?? table.content(caster.token).monsters.get(choice.monster);
  if (!monster) throw new Refusal(`There is no ${choice.monster} in the bestiary`);
  const count = summonCount(choice, cast);
  const spots = freeSpots(table, placeToken(req.point!, monster.size, table.store.world), monster.size, count);
  const tokens = spots.map(([x, y], i) =>
    TokenSchema.parse({
      id: freeId(table, choice.monster, i),
      name: count > 1 ? `${monster.name} ${i + 1}` : monster.name,
      x,
      y,
      size: monster.size,
      color: caster.token.color,
      speed: monster.speed,
      darkvision: monster.darkvision,
      monster: monster.id,
      ...(built && { own: { monsters: [built] } }),
      ownership: caster.token.ownership,
      summon: { by: caster.token.id, spell: spell.id, concentration: spell.concentration },
      leader: spell.summon!.turn === 'shared' ? caster.token.id : undefined,
    }),
  );
  for (const t of tokens) table.store.setToken(t);
  const combat = table.store.combat;
  if (combat && spell.summon!.turn === 'own' && table.inFight(caster.token.id)) {
    table.store.setCombat(
      joinCombat(
        combat,
        caster.token.id,
        tokens.map((t) => t.id),
      ),
    );
  }
  return tokens;
}

/** The slot, the spell's level and the caster's spell attack and modifier, for a creature built by the spell. */
function castOf(table: Table, caster: Fighter, spell: Spell, slot: number): SummonCast {
  const sheet = caster.sheet.caster;
  const mod = sheet ? abilityMod(caster.sheet.abilities[sheet.ability]) : 0;
  return { slot: Math.max(slot, spell.level), level: spell.level, attack: sheet?.attack ?? 0, mod };
}

function freeId(table: Table, base: string, from: number): string {
  let n = from + 1;
  while (table.store.tokens.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** `count` spots around `start` with no token on them, nearest first: squares, or hexes on a hex grid. */
function freeSpots(table: Table, start: Point, size: number, count: number): Point[] {
  const world = table.store.world;
  const hexes = gridKind(world).startsWith('hex') ? sceneLattice(world) : undefined;
  const ring = (n: number) => (hexes ? hexRing(hexes, start, n) : ringAround(start, n, world.gridSize * size));
  const taken = new Set([...table.store.tokens.values()].map((t) => `${t.x},${t.y}`));
  const out: Point[] = [];
  for (let n = 0; out.length < count && n < 10; n++) {
    for (const p of ring(n)) {
      if (out.length < count && !taken.has(`${p[0]},${p[1]}`)) {
        out.push(p);
        taken.add(`${p[0]},${p[1]}`);
      }
    }
  }
  return out;
}

/** The centres of the hexes `ring` steps from the hex at `c`. */
function hexRing(hexes: Lattice, c: Point, ring: number): Point[] {
  const at = hexes.cellOf(c);
  const out: Point[] = [];
  for (let dq = -ring; dq <= ring; dq++) {
    for (let dr = -ring; dr <= ring; dr++) {
      const cell: Point = [at[0] + dq, at[1] + dr];
      if (hexes.distance(at, cell) === ring) out.push(hexes.centre(cell));
    }
  }
  return out;
}

/** The squares on the edge of a square ring `ring` steps out from `c`. */
function ringAround(c: Point, ring: number, step: number): Point[] {
  if (ring === 0) return [c];
  const out: Point[] = [];
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) out.push([c[0] + dx * step, c[1] + dy * step]);
    }
  }
  return out;
}
