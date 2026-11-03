import { slugify } from '@vtt/core';
import type { PlacedLight, Tile } from '@vtt/shared';
import type { FoundryDoc } from './foundry-db.ts';
import type { Floors } from './foundry-levels.ts';
import { FoundryLight, lightOf } from './foundry-lights.ts';
import type { MediaLookup } from './foundry-scene.ts';

// Tokens with no actor in the world. Map makers (Baileywiki) build scenes
// from tokens with map art (trees, torches, facades, wagons) so Token
// Attacher can move them: those are scenery, and become tiles here, with
// the light a torch or lamp sheds. The rest are creatures whose actor stayed
// in a compendium: each name gets an actor of its own, with the token's
// picture, so they come with the Actors tab.

const obj = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const pictureOf = (t: FoundryDoc) => {
  const src = obj(t.texture).src ?? t.img;
  return typeof src === 'string' && src ? src : undefined;
};

/** Map art, by the folder it is in (a module's maps, tiles or props, or a map maker's assets). */
const MAP_ART = /(^|\/)(maps|tiles|props|scenery|assets\/modules|icons)\//i;
const FIGURES = /(^|\/)(tokens?|tokenizer|portraits|creatures|monsters|npcs?|characters)\//i;
const shedsLight = (t: FoundryDoc) => (num(obj(t.light).bright) ?? 0) + (num(obj(t.light).dim) ?? 0) > 0;

/** Whether a token with no actor is scenery: map art, or no picture and a light. */
export function isProp(t: FoundryDoc): boolean {
  const src = pictureOf(t);
  if (!src) return shedsLight(t);
  if (/blank\.webp|transparent/i.test(src)) return true;
  return MAP_ART.test(src) && !FIGURES.test(src) && !src.includes('mystery-man');
}

export interface PropContext {
  /** Pixels per square. */
  grid: number;
  media: MediaLookup;
  /** Foundry units in feet. */
  feet: (units: number) => number;
  floors?: Floors;
}

const sizeOf = (t: FoundryDoc, grid: number) => {
  const w = (num(t.width) ?? 1) * grid;
  return { w, h: (num(t.height) ?? num(t.width) ?? 1) * grid };
};

function tileOf(t: FoundryDoc, c: PropContext): Omit<Tile, 'id'> | undefined {
  const path = pictureOf(t);
  const src = path ? c.media(path) : undefined;
  if (!src) return undefined;
  return {
    kind: 'image',
    x: num(t.x) ?? 0,
    y: num(t.y) ?? 0,
    ...sizeOf(t, c.grid),
    src,
    ...(t.hidden === true ? { hidden: true } : {}),
    ...(c.floors?.on(t) ?? {}),
  } as Omit<Tile, 'id'>;
}

function lightFrom(t: FoundryDoc, c: PropContext): Omit<PlacedLight, 'id'> | undefined {
  if (!shedsLight(t)) return undefined;
  const { w, h } = sizeOf(t, c.grid);
  const at = { x: (num(t.x) ?? 0) + w / 2, y: (num(t.y) ?? 0) + h / 2 };
  const parsed = FoundryLight.safeParse({ ...at, config: t.light });
  const light = parsed.success ? lightOf(parsed.data, c.feet) : undefined;
  return light && { ...light, ...(t.hidden === true ? { hidden: true } : {}), ...(c.floors?.on(t) ?? {}) };
}

/** The tiles and lights scenery tokens become (without ids). */
export function propsOf(tokens: readonly FoundryDoc[], c: PropContext) {
  return {
    tiles: tokens.flatMap((t) => tileOf(t, c) ?? []),
    lights: tokens.flatMap((t) => lightFrom(t, c) ?? []),
  };
}

/** The Foundry id we give the actor of the creatures named `name` that have none. */
const looseId = (name: string) => `loose-${slugify(name) || 'creature'}`;

const nameOf = (t: FoundryDoc) => (typeof t.name === 'string' && t.name.trim() ? t.name.trim() : undefined);
const tokensOf = (s: FoundryDoc) => (Array.isArray(s.tokens) ? s.tokens : []) as FoundryDoc[];

function looseActor(t: FoundryDoc, name: string): FoundryDoc {
  const img = pictureOf(t);
  return {
    _id: looseId(name),
    name,
    type: 'npc',
    ...(img ? { img } : {}),
    prototypeToken: { texture: { src: img }, width: num(t.width) ?? 1, actorLink: false },
    system: {},
  };
}

/** One Foundry actor for each name of the creatures standing on `scenes` without an actor (`hasActor`). */
export function looseActors(scenes: readonly FoundryDoc[], hasActor: (t: FoundryDoc) => boolean): FoundryDoc[] {
  const byId = new Map<string, FoundryDoc>();
  for (const t of scenes.flatMap(tokensOf)) {
    const name = nameOf(t);
    if (name && !hasActor(t) && !isProp(t) && !byId.has(looseId(name))) byId.set(looseId(name), looseActor(t, name));
  }
  return [...byId.values()];
}

/** A scene's tokens: scenery, and the rest (creatures without an actor pointed at theirs from looseActors). */
export function splitTokens(raw: unknown, hasActor: (t: FoundryDoc) => boolean) {
  const all = (Array.isArray(raw) ? raw : []) as FoundryDoc[];
  const loose = (t: FoundryDoc) => !hasActor(t);
  const props = all.filter((t) => loose(t) && isProp(t));
  const creatures = all
    .filter((t) => !props.includes(t))
    .map((t) => {
      const name = loose(t) ? nameOf(t) : undefined;
      return name ? { ...t, actorId: looseId(name), actorLink: false } : t;
    });
  return { props, creatures };
}
