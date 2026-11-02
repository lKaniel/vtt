import type { Op } from '@vtt/core';
import { burntOut, stampLight } from '@vtt/shared';
import { burnOut, expireEffects, lastingEnds, roundsLeft, stampDurations, type Token } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

// What runs out as world time passes (see world-clock.ts), on every scene:
// effects whose time is up end, concentration ends with its spell, summons
// whose spell is over vanish, templates with an end time go, and lights
// burn out (a torch a token carries, a campfire on the map). What a spell,
// feature or lit torch starts is first given its end time, from the clock.

export class TimeOut {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  /** Brings everything on every scene in line with the clock at `now`. */
  settle(now: number): void {
    for (const scene of this.store.sceneIds()) {
      this.store.inScene(scene, () => {
        const fight = !!this.store.combat && scene === this.store.activeScene;
        for (const id of [...this.store.tokens.keys()]) this.token(id, now, fight);
        this.templates(scene, now);
        this.lights(scene, now);
      });
    }
  }

  /** A fight starts: effects count the rounds they have left (see durations.ts). */
  fightStarts(now: number): void {
    for (const t of [...this.store.tokens.values()]) {
      const after = roundsLeft(t, now);
      if (after !== t) this.store.setToken(after);
    }
  }

  private token(id: string, now: number, fight: boolean): void {
    const t = this.store.tokens.get(id);
    if (!t) return;
    const spells = this.table.content(t).spells;
    const stamped = stampDurations(t, now, (spell) => spells.get(spell)?.rounds);
    const expired = expireEffects(stamped, now, fight);
    const { token, out } = burnOut(expired.token, now);
    if (token !== t) this.store.setToken(token);
    for (const e of expired.ended) this.table.note(`${e.name} ends on ${t.name}`);
    if (out) this.table.note(`${t.name}'s ${out.name ?? 'light'} burns out`);
    this.lasting(token, now);
  }

  /** Concentration whose spell is over ends; a summon whose spell is over vanishes. */
  private lasting(token: Token, now: number): void {
    const over = lastingEnds(token, now);
    if (over.concentration) {
      this.table.note(`${token.concentration!.name} ends: ${token.name} stops concentrating`);
      this.table.endConcentration(token.id);
    }
    if (over.summon && this.store.tokens.has(token.id)) {
      this.table.note(`${token.name} vanishes`);
      this.table.removeToken(token.id);
    }
  }

  /** Placed lights that burn for a while get their end time, and go once burnt out. */
  private lights(scene: string, now: number): void {
    const coll = `${scene}/lights`;
    const ops: Op[] = [];
    for (const d of this.store.docs.all(coll)) {
      const light = d as { lasts?: number; endsAt?: number };
      if (burntOut(light, now)) ops.push({ op: 'delete', coll, id: d.id });
      else if (stampLight(light, now) !== light)
        ops.push({ op: 'update', coll, id: d.id, patch: { endsAt: now + light.lasts! } });
    }
    if (ops.length) this.store.applyOps(ops);
  }

  private templates(scene: string, now: number): void {
    const coll = `${scene}/templates`;
    const ops: Op[] = this.store.docs
      .all(coll)
      .filter((d) => typeof d.endsAt === 'number' && d.endsAt <= now && !d.effect)
      .map((d) => ({ op: 'delete', coll, id: d.id }));
    if (ops.length) this.store.applyOps(ops);
  }
}
