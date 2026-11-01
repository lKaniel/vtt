import { describe, expect, it } from 'vitest';
import {
  ActorSchema,
  deltaOf,
  linkToken,
  resetToken,
  resolveToken,
  saveTokenToActor,
  splitToken,
  standaloneEntry,
  TokenEntrySchema,
  TokenSchema,
  unlinkToken,
  type Actor,
  type Token,
  type TokenEntry,
} from './index.ts';

const goblin = ActorSchema.parse({ id: 'goblin', name: 'Goblin', monster: 'goblin', folder: 'Monsters' });
const bram = ActorSchema.parse({
  id: 'bram',
  name: 'Bram',
  controllers: ['player2'],
  stats: { maxHp: 28, abilities: { str: 16 } },
  hp: 20,
});
const entry = (data: object): TokenEntry => TokenEntrySchema.parse({ id: 't', x: 50, y: 150, ...data });
const resolved = (e: TokenEntry, a?: Actor): Token => {
  const r = resolveToken(e, a);
  if (!r.token) throw new Error(r.errors.join('; '));
  return r.token;
};

describe('token entries', () => {
  it('keeps where a token stands and what differs from its actor', () => {
    const e = entry({ actor: 'goblin', linked: false, delta: { name: 'Goblin 2', hp: 3, tempHp: null } });
    expect(e).toEqual({
      id: 't',
      x: 50,
      y: 150,
      actor: 'goblin',
      linked: false,
      delta: { name: 'Goblin 2', hp: 3, tempHp: null },
    });
  });

  it('writes no defaults into the file', () => {
    expect(entry({ actor: 'goblin' })).toEqual({ id: 't', x: 50, y: 150, actor: 'goblin' });
  });

  it('lets a token without an actor carry its whole sheet, like before', () => {
    const e = entry({ name: 'Wolf', monster: 'wolf' });
    expect(resolved(e)).toMatchObject({ id: 't', name: 'Wolf', monster: 'wolf', size: 1, linked: false });
  });

  it('refuses a sheet next to an actor: changes go in delta', () => {
    const r = TokenEntrySchema.safeParse({ id: 't', x: 0, y: 0, actor: 'goblin', hp: 3 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/delta/);
  });
});

describe('resolving a token', () => {
  it('reads a linked token from its actor', () => {
    const t = resolved(entry({ id: 'bram', actor: 'bram', linked: true }), bram);
    expect(t).toMatchObject({ id: 'bram', name: 'Bram', hp: 20, x: 50, y: 150, actor: 'bram', linked: true });
    expect('folder' in t).toBe(false);
  });

  it('lays the delta of an unlinked token over the actor; null removes a field', () => {
    const hurt = ActorSchema.parse({ ...goblin, tempHp: 4 });
    const t = resolved(
      entry({ actor: 'goblin', linked: false, delta: { name: 'Goblin 2', hp: 3, tempHp: null } }),
      hurt,
    );
    expect(t).toMatchObject({ name: 'Goblin 2', hp: 3, monster: 'goblin', linked: false });
    expect(t.tempHp).toBeUndefined();
  });

  it('never takes position or visibility from the actor', () => {
    const ambusher = ActorSchema.parse({ ...goblin, hidden: true, visibleTo: ['gm'] });
    const t = resolved(entry({ actor: 'goblin' }), ambusher);
    expect(t.hidden).toBe(false);
    expect(t.visibleTo).toBeUndefined();
  });

  it('links characters and unlinks monsters unless the token or actor says', () => {
    expect(resolved(entry({ actor: 'bram' }), bram).linked).toBe(true);
    expect(resolved(entry({ actor: 'goblin' }), goblin).linked).toBe(false);
    expect(resolved(entry({ actor: 'goblin' }), { ...goblin, linked: true }).linked).toBe(true);
    expect(resolved(entry({ actor: 'bram', linked: false }), bram).linked).toBe(false);
  });

  it('reports a missing actor and an invalid result', () => {
    expect(resolveToken(entry({ actor: 'nobody' }), undefined).errors).toEqual(['unknown actor "nobody"']);
    expect(resolveToken(entry({ actor: 'goblin', delta: { name: null } }), goblin).errors[0]).toMatch(/name/);
  });
});

describe('saving a changed token', () => {
  it('writes a linked token’s damage to the actor, so every copy shares it', () => {
    const e = entry({ id: 'bram', actor: 'bram', linked: true });
    const t = resolved(e, bram);
    const out = splitToken({ ...t, hp: 12, x: 250 }, e, bram);
    expect(out.entry).toEqual({ ...e, x: 250 });
    expect(out.actor).toMatchObject({ id: 'bram', hp: 12 });
    expect(out.actor && 'x' in out.actor).toBe(false);
  });

  it('leaves the actor alone when only the position moved', () => {
    const e = entry({ id: 'bram', actor: 'bram', linked: true });
    expect(splitToken({ ...resolved(e, bram), y: 450 }, e, bram).actor).toBeUndefined();
  });

  it('removes a field from a linked actor', () => {
    const e = entry({ id: 'bram', actor: 'bram', linked: true });
    const { hp: _hp, ...healed } = resolved(e, bram);
    expect(splitToken(healed, e, bram).actor?.hp).toBeUndefined();
  });

  it('keeps an unlinked token’s changes in its delta', () => {
    const e = entry({ actor: 'goblin', linked: false, delta: { name: 'Goblin 2' } });
    const t = resolved(e, goblin);
    const out = splitToken({ ...t, hp: 2, effects: [] }, e, goblin);
    expect(out.actor).toBeUndefined();
    expect(out.entry.delta).toEqual({ name: 'Goblin 2', hp: 2, effects: [] });
  });

  it('writes null for a field the actor has and the token lost', () => {
    const hurt = ActorSchema.parse({ ...goblin, hp: 5 });
    const e = entry({ actor: 'goblin', linked: false });
    const { hp: _hp, ...healed } = resolved(e, hurt);
    expect(splitToken(healed, e, hurt).entry.delta).toEqual({ hp: null });
  });

  it('drops the delta once the token is back to its actor', () => {
    const e = entry({ actor: 'goblin', linked: false, delta: { hp: 2 } });
    const { hp: _hp, ...fresh } = resolved(e, goblin);
    expect(splitToken(fresh, e, goblin).entry).toEqual({ id: 't', x: 50, y: 150, actor: 'goblin', linked: false });
  });

  it('keeps a linked token’s own delta (its own name) on the token', () => {
    const e = entry({ id: 'bram', actor: 'bram', linked: true, delta: { name: 'Bram in disguise' } });
    const t = resolved(e, bram);
    const out = splitToken({ ...t, name: 'Bram the Bold', hp: 10 }, e, bram);
    expect(out.entry.delta).toEqual({ name: 'Bram the Bold' });
    expect(out.actor).toMatchObject({ name: 'Bram', hp: 10 });
  });

  it('creates the actor a new token names when it does not exist yet', () => {
    const t = TokenSchema.parse({ id: 'mira', name: 'Mira', x: 0, y: 0, actor: 'mira', linked: true, hp: 7 });
    const out = splitToken(t, undefined, undefined);
    expect(out.entry).toEqual({ id: 'mira', x: 0, y: 0, actor: 'mira', linked: true });
    expect(out.actor).toMatchObject({ id: 'mira', name: 'Mira', hp: 7 });
  });

  it('stores a token without an actor as its whole sheet', () => {
    const t = TokenSchema.parse({ id: 'wolf', name: 'Wolf', x: 0, y: 0, monster: 'wolf' });
    const out = splitToken(t, undefined, undefined);
    expect(out.actor).toBeUndefined();
    expect(resolved(out.entry)).toEqual({ ...t, linked: false });
  });
});

describe('linking and unlinking', () => {
  const hurtBram = entry({ id: 'bram', actor: 'bram', linked: true });

  it('unlinks a token into a copy that starts as the actor is', () => {
    const e = unlinkToken(hurtBram);
    expect(e.linked).toBe(false);
    expect(resolved(e, bram)).toMatchObject({ hp: 20, linked: false });
  });

  it('links a token back, dropping its own changes', () => {
    const e = linkToken(entry({ actor: 'goblin', linked: false, delta: { hp: 1 } }));
    expect(e).toEqual({ id: 't', x: 50, y: 150, actor: 'goblin', linked: true });
  });

  it('saves a copy’s changes to the actor, keeping its wounds and name', () => {
    const e = entry({ actor: 'goblin', linked: false, delta: { name: 'Goblin 2', hp: 1, size: 2 } });
    const out = saveTokenToActor(e, goblin);
    expect(out.actor).toMatchObject({ id: 'goblin', name: 'Goblin', size: 2, folder: 'Monsters' });
    expect(out.actor.hp).toBeUndefined();
    expect(out.entry.delta).toEqual({ name: 'Goblin 2', hp: 1 });
  });

  it('resets a copy to its actor, keeping its numbered name', () => {
    const e = resetToken(entry({ actor: 'goblin', linked: false, delta: { name: 'Goblin 2', hp: 1 } }));
    expect(e.delta).toEqual({ name: 'Goblin 2' });
  });

  it('turns a token into one that carries its own sheet (its actor is going away)', () => {
    const e = entry({ id: 'bram', actor: 'bram', linked: true });
    const alone = standaloneEntry(resolved(e, bram));
    expect(alone.actor).toBeUndefined();
    expect(resolved(alone)).toMatchObject({ name: 'Bram', hp: 20, x: 50, linked: false });
  });
});

describe('deltaOf', () => {
  it('lists what changed, with null for what went', () => {
    expect(deltaOf({ a: 1, b: { c: 2 }, d: 3 }, { a: 1, b: { c: 3 }, e: 4 })).toEqual({ b: { c: 2 }, d: 3, e: null });
  });
});
