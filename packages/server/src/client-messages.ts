import { OpSchema } from '@vtt/core';
import { DoorStateSchema, FogEditSchema, MapEditSchema, PointSchema, RoleSchema } from '@vtt/shared';
import { EditionSchema } from '@vtt/system-dnd5e';
import type { RawData } from 'ws';
import { z } from 'zod';

// What clients may send, checked before the game looks at it.

const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('view'), chunks: z.array(z.string()).max(400) }),
  z.object({ t: z.literal('move'), token: z.string(), to: PointSchema }),
  z.object({ t: z.literal('door'), chunk: z.string(), wall: z.string(), state: DoorStateSchema }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(2000) }),
  z.object({ t: z.literal('combatStart'), tokens: z.array(z.string()).min(1).max(100) }),
  z.object({ t: z.literal('combatEnd') }),
  z.object({ t: z.literal('endTurn') }),
  z.object({
    t: z.literal('attack'),
    attacker: z.string(),
    target: z.string(),
    attack: z.string(),
    smite: z.number().int().min(1).max(9).optional(),
  }),
  z.object({ t: z.literal('equip'), token: z.string(), item: z.number().int().nonnegative(), equipped: z.boolean() }),
  z.object({
    t: z.literal('cast'),
    caster: z.string(),
    spell: z.string(),
    slot: z.number().int().min(0).max(9),
    free: z.boolean().optional(),
    repeat: z.boolean().optional(),
    targets: z.array(z.string()).max(20),
    point: PointSchema.optional(),
    summon: z.string().optional(),
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
  z.object({ t: z.literal('dropConcentration'), token: z.string() }),
  z.object({ t: z.literal('removeEffect'), token: z.string(), effect: z.string() }),
  z.object({ t: z.literal('rest'), tokens: z.array(z.string()).min(1).max(100), kind: z.enum(['short', 'long']) }),
  z.object({ t: z.literal('editToken'), token: z.string(), patch: z.record(z.string(), z.unknown()) }),
  z.object({ t: z.literal('deleteToken'), token: z.string() }),
  z.object({ t: z.literal('relinkToken'), token: z.string(), how: z.enum(['link', 'unlink', 'save', 'reset']) }),
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
