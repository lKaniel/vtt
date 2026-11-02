import { OpSchema } from '@vtt/core';
import {
  ClockActionSchema,
  DoorStateSchema,
  FogEditSchema,
  MapEditSchema,
  PointSchema,
  RoleSchema,
  ROLL_MODES,
} from '@vtt/shared';
import { ConditionSchema, CurrencySchema, EditionSchema } from '@vtt/system-dnd5e';
import type { RawData } from 'ws';
import { z } from 'zod';

// What clients may send, checked before the game looks at it.

/** Uploads up to 20 MB, as base64. */
const MAX_UPLOAD_BASE64 = Math.ceil((20 * 1024 * 1024 * 4) / 3) + 4;

/** Waypoints a ruler may have. */
const MAX_RULER_POINTS = 64;
const index = z.number().int().nonnegative();

/** Tokens one player may target at once. */
const MAX_TARGETS = 50;

const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('rollTable'), table: z.string(), gmOnly: z.boolean().optional() }),
  z.object({ t: z.literal('showJournal'), entry: z.string(), page: z.string().optional() }),
  z.object({ t: z.literal('showImage'), src: z.string().min(1).max(500), title: z.string().max(200).optional() }),
  z.object({
    t: z.literal('profile'),
    color: z.string().max(40).optional(),
    avatar: z.string().max(500).nullable().optional(),
  }),
  z.object({ t: z.literal('view'), chunks: z.array(z.string()).max(400) }),
  z.object({ t: z.literal('move'), token: z.string(), to: PointSchema }),
  z.object({ t: z.literal('ruler'), points: z.array(PointSchema).max(MAX_RULER_POINTS) }),
  z.object({ t: z.literal('cursor'), at: PointSchema.nullable() }),
  z.object({ t: z.literal('ping'), at: PointSchema, pull: z.boolean().optional() }),
  z.object({ t: z.literal('target'), tokens: z.array(z.string()).max(MAX_TARGETS) }),
  z.object({ t: z.literal('rollMode'), mode: z.enum(ROLL_MODES) }),
  z.object({ t: z.literal('door'), chunk: z.string(), wall: z.string(), state: DoorStateSchema }),
  z.object({ t: z.literal('trigger'), tile: z.string(), token: z.string().optional() }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(2000) }),
  z.object({ t: z.literal('combatStart'), tokens: z.array(z.string()).min(1).max(100) }),
  z.object({ t: z.literal('combatEnd') }),
  z.object({ t: z.literal('turnBased'), on: z.boolean() }),
  z.object({ t: z.literal('clock'), action: ClockActionSchema }),
  z.object({ t: z.literal('endTurn') }),
  z.object({
    t: z.literal('attack'),
    attacker: z.string(),
    target: z.string(),
    attack: z.string(),
    smite: z.number().int().min(1).max(9).optional(),
  }),
  z.object({ t: z.literal('equip'), token: z.string(), item: z.number().int().nonnegative(), equipped: z.boolean() }),
  z.object({ t: z.literal('hitDie'), token: z.string() }),
  z.object({ t: z.literal('legendary'), token: z.string(), option: z.string(), target: z.string().optional() }),
  z.object({ t: z.literal('lair'), token: z.string(), action: z.string() }),
  z.object({ t: z.literal('exhaustion'), token: z.string(), level: z.number().int().min(0).max(6) }),
  z.object({
    t: z.literal('carry'),
    token: z.string(),
    change: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('coins'), currency: CurrencySchema }),
      z.object({ kind: z.literal('stow'), item: index, into: index.nullable() }),
      z.object({ kind: z.literal('attune'), item: index, on: z.boolean() }),
    ]),
  }),
  z.object({
    t: z.literal('cast'),
    caster: z.string(),
    spell: z.string(),
    slot: z.number().int().min(0).max(9),
    free: z.boolean().optional(),
    repeat: z.boolean().optional(),
    scroll: z.boolean().optional(),
    targets: z.array(z.string()).max(20),
    point: PointSchema.optional(),
    summon: z.string().optional(),
    choice: z.string().optional(),
  }),
  z.object({
    t: z.literal('feature'),
    token: z.string(),
    feature: z.string(),
    targets: z.array(z.string()).max(20).optional(),
    point: PointSchema.optional(),
  }),
  z.object({ t: z.literal('useItem'), token: z.string(), item: z.string() }),
  z.object({ t: z.literal('react'), offer: z.string(), choice: z.string().optional() }),
  z.object({ t: z.literal('condition'), token: z.string(), condition: ConditionSchema, on: z.boolean() }),
  z.object({ t: z.literal('combatant'), token: z.string(), on: z.boolean() }),
  z.object({ t: z.literal('pause'), on: z.boolean() }),
  z.object({
    t: z.literal('applyDamage'),
    card: z.string(),
    tokens: z.array(z.string()).min(1).max(50),
    how: z.enum(['full', 'half', 'double', 'heal']),
  }),
  z.object({ t: z.literal('dropConcentration'), token: z.string() }),
  z.object({ t: z.literal('removeEffect'), token: z.string(), effect: z.string() }),
  z.object({ t: z.literal('seatSettings'), settings: z.record(z.string().max(40), z.string().max(40)) }),
  z.object({ t: z.literal('rest'), tokens: z.array(z.string()).min(1).max(100), kind: z.enum(['short', 'long']) }),
  z.object({ t: z.literal('editToken'), token: z.string(), patch: z.record(z.string(), z.unknown()) }),
  z.object({ t: z.literal('deleteToken'), token: z.string() }),
  z.object({ t: z.literal('relinkToken'), token: z.string(), how: z.enum(['link', 'unlink', 'save', 'reset']) }),
  z.object({
    t: z.literal('animation'),
    token: z.string(),
    ref: z.string().max(90),
    animation: z.string().max(300).optional(),
  }),
  z.object({
    t: z.literal('hotbar'),
    token: z.string(),
    slots: z.array(z.string().max(80).nullable()).max(60),
  }),
  z.object({
    t: z.literal('spawn'),
    from: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('monster'), id: z.string(), rules: EditionSchema }),
      z.object({ kind: z.literal('actor'), id: z.string() }),
    ]),
    at: PointSchema,
    hidden: z.boolean().optional(),
  }),
  z.object({
    t: z.literal('drop'),
    what: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('item'), id: z.string() }),
      z.object({ kind: z.literal('spell'), id: z.string(), rules: EditionSchema }),
      z.object({ kind: z.literal('feature'), id: z.string(), class: z.string(), rules: EditionSchema }),
    ]),
    onto: z.object({ kind: z.enum(['token', 'actor']), id: z.string() }),
    area: z.enum(['inventory', 'spells', 'features']).optional(),
  }),
  z.object({ t: z.literal('give'), from: z.string(), to: z.string(), item: z.string(), spell: z.string().optional() }),
  // The actor itself is checked by GmActions, so a broken one gets a readable refusal.
  z.object({ t: z.literal('saveActor'), actor: z.unknown() }),
  z.object({ t: z.literal('deleteActor'), actor: z.string() }),
  z.object({ t: z.literal('setRole'), player: z.string(), role: RoleSchema }),
  z.object({ t: z.literal('mapEdit'), edit: MapEditSchema }),
  z.object({ t: z.literal('darkness'), darkness: z.number().min(0).max(1) }),
  z.object({
    t: z.literal('ops'),
    txn: z.string().min(1).max(80),
    label: z.string().max(40).optional(),
    ops: z.array(OpSchema).min(1).max(20000),
  }),
  z.object({ t: z.literal('viewScene'), scene: z.string() }),
  z.object({ t: z.literal('activateScene'), scene: z.string() }),
  z.object({ t: z.literal('sendPlayer'), player: z.string(), scene: z.string().optional() }),
  z.object({ t: z.literal('fog'), edit: FogEditSchema }),
  z.object({ t: z.literal('undo'), card: z.string().optional() }),
  z.object({ t: z.literal('redo') }),
  z.object({ t: z.literal('packs') }),
  z.object({ t: z.literal('media') }),
  z.object({ t: z.literal('compendium'), pack: z.string().max(80), compendium: z.string().max(80) }),
  z.object({ t: z.literal('upload'), name: z.string().min(1).max(200), data: z.string().max(MAX_UPLOAD_BASE64) }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** The message in a frame, or undefined if it isn't one we know. */
export function parseClientMessage(data: RawData): ClientMessage | undefined {
  const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
  const text = buffer.toString('utf8');
  try {
    const parsed = ClientMessageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
