import type { Point } from '@vtt/shared';
import { joinCombat, type Spell, type Token, TokenSchema } from '@vtt/system-dnd5e';
import type { CastRequest } from './spell-actions.ts';
import { Refusal, type Fighter, type Table } from './table.ts';

// Summoning spells: the creatures appear on free squares around the aimed
// point, on the caster's side, and join the fight when they get their own turn.

/** Brings what the spell summons next to the aimed point, in the fight when they get their own turn. */
export function summon(
  table: Table,
  caster: Fighter,
  spell: Spell,
  req: Pick<CastRequest, 'summon' | 'point'>,
): Token[] {
  const options = spell.summon!.options;
  const choice = options.find((o) => o.monster === req.summon) ?? (options.length === 1 ? options[0] : undefined);
  if (!choice) throw new Refusal(`Pick what ${spell.name} summons: ${options.map((o) => o.monster).join(', ')}`);
  const monster = table.content(caster.token).monsters.get(choice.monster);
  if (!monster) throw new Refusal(`There is no ${choice.monster} in the bestiary`);
  const spots = freeSpots(table, snapTo(table, req.point!, monster.size), monster.size, choice.count);
  const tokens = spots.map(([x, y], i) =>
    TokenSchema.parse({
      id: freeId(table, choice.monster, i),
      name: choice.count > 1 ? `${monster.name} ${i + 1}` : monster.name,
      x,
      y,
      size: monster.size,
      color: caster.token.color,
      speed: monster.speed,
      darkvision: monster.darkvision,
      monster: monster.id,
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

function freeId(table: Table, base: string, from: number): string {
  let n = from + 1;
  while (table.store.tokens.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** `count` squares around `start` with no token on them, nearest first. */
function freeSpots(table: Table, start: Point, size: number, count: number): Point[] {
  const g = table.store.world.gridSize * size;
  const taken = new Set([...table.store.tokens.values()].map((t) => `${t.x},${t.y}`));
  const out: Point[] = [];
  for (let ring = 0; out.length < count && ring < 10; ring++) {
    for (const p of ringAround(start, ring, g)) {
      if (out.length < count && !taken.has(`${p[0]},${p[1]}`)) {
        out.push(p);
        taken.add(`${p[0]},${p[1]}`);
      }
    }
  }
  return out;
}

/** A point moved onto the grid square (or corner) where a creature of `size` squares stands. */
function snapTo(table: Table, [x, y]: Point, size: number): Point {
  const g = table.store.world.gridSize;
  const axis = (v: number) => (size % 2 ? (Math.floor(v / g) + 0.5) * g : Math.round(v / g) * g);
  return [axis(x), axis(y)];
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
