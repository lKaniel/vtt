import { AssetQuerySchema, OpSchema } from '@vtt/core';
import {
  ClockActionSchema,
  DoorStateSchema,
  FogEditSchema,
  MapEditSchema,
  PointSchema,
  RoleSchema,
  ROLL_MODES,
} from '@vtt/shared';
import {
  ABILITIES,
  ConditionSchema,
  CurrencySchema,
  EditionSchema,
  RollAskSchema,
  RollChoiceSchema,
} from '@vtt/system-dnd5e';
import type { RawData } from 'ws';
import { z } from 'zod';

// What clients may send, checked before the game looks at it.

/** Uploads up to 20 MB, as base64. */
const MAX_UPLOAD_BASE64 = Math.ceil((20 * 1024 * 1024 * 4) / 3) + 4;

/** An ability check, or a skill or tool check using that ability. */
const checkKind = {
  ability: z.enum(ABILITIES),
  skill: z.string().max(40).optional(),
  save: z.boolean().optional(),
  tool: z.string().max(40).optional(),
};

/** Waypoints a ruler may have. */
const MAX_RULER_POINTS = 64;
const index = z.number().int().nonnegative();

/** Tokens one player may target at once. */
const MAX_TARGETS = 50;

/** Cards moved or dealt at once. */
const MAX_CARDS = 200;
const cardStack = z.string().max(80);

/** A new creature: a monster's stock actor or an actor of the list, placed at a point. */
const SpawnSchema = z.object({
  from: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('monster'), id: z.string(), rules: EditionSchema }),
    z.object({ kind: z.literal('actor'), id: z.string() }),
  ]),
  at: PointSchema,
  hidden: z.boolean().optional(),
});

/** Creatures one build may place. */
const MAX_SPAWNS = 500;

const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('drawCards'),
    from: cardStack,
    to: cardStack,
    n: z.number().int().min(1).max(MAX_CARDS).optional(),
  }),
  z.object({
    t: z.literal('passCards'),
    from: cardStack,
    to: cardStack,
    cards: z.array(z.string().max(170)).min(1).max(MAX_CARDS),
  }),
  z.object({ t: z.literal('shuffleCards'), stack: cardStack }),
  z.object({
    t: z.literal('dealCards'),
    from: cardStack,
    to: z.array(cardStack).min(1).max(50),
    n: z.number().int().min(1).max(MAX_CARDS).optional(),
  }),
  z.object({ t: z.literal('resetCards'), deck: cardStack }),
  z.object({ t: z.literal('rollTable'), table: z.string(), gmOnly: z.boolean().optional() }),
  z.object({ t: z.literal('runMacro'), macro: z.string().max(80), token: z.string().max(80).optional() }),
  z.object({ t: z.literal('showJournal'), entry: z.string(), page: z.string().optional() }),
  z.object({ t: z.literal('showImage'), src: z.string().min(1).max(500), title: z.string().max(200).optional() }),
  z.object({
    t: z.literal('profile'),
    color: z.string().max(40).optional(),
    avatar: z.string().max(500).nullable().optional(),
  }),
  z.object({ t: z.literal('view'), chunks: z.array(z.string()).max(400) }),
  // throughWalls: the GM's "ignore walls" mode, straight there (refused to players: they walk).
  // elevation: in a 3D scene, how high the walk ends (what it climbed onto).
  z.object({
    t: z.literal('move'),
    token: z.string(),
    to: PointSchema,
    throughWalls: z.boolean().optional(),
    elevation: z.number().min(-10000).max(10000).optional(),
  }),
  z.object({ t: z.literal('ruler'), points: z.array(PointSchema).max(MAX_RULER_POINTS) }),
  z.object({ t: z.literal('cursor'), at: PointSchema.nullable() }),
  z.object({ t: z.literal('ping'), at: PointSchema, pull: z.boolean().optional() }),
  z.object({ t: z.literal('target'), tokens: z.array(z.string()).max(MAX_TARGETS) }),
  z.object({ t: z.literal('rollMode'), mode: z.enum(ROLL_MODES) }),
  /** GM: the soundboard plays a sound once for everyone at the table. */
  z.object({ t: z.literal('playSound'), src: z.string().min(1).max(500), volume: z.number().min(0).max(1).optional() }),
  z.object({ t: z.literal('door'), chunk: z.string(), wall: z.string(), state: DoorStateSchema }),
  z.object({ t: z.literal('trigger'), tile: z.string(), token: z.string().optional() }),
  z.object({ t: z.literal('triggerChoice'), id: z.string().max(64), option: z.number().int().min(0).max(7) }),
  z.object({ t: z.literal('changeLevel'), token: z.string(), level: z.string() }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(2000) }),
  z.object({
    t: z.literal('combatStart'),
    tokens: z.array(z.string()).min(1).max(100),
    shared: z.boolean().optional(),
    /** Creatures the GM says are surprised, besides those that notice no foe. */
    surprised: z.array(z.string()).max(100).optional(),
  }),
  z.object({ t: z.literal('combatEnd') }),
  z.object({
    t: z.literal('turnBased'),
    on: z.boolean(),
    /** Who takes turns; missing or empty: the party on the scene. */
    tokens: z.array(z.string()).optional(),
    /** BG3's shared party turns. */
    shared: z.boolean().optional(),
  }),
  z.object({ t: z.literal('clock'), action: ClockActionSchema }),
  z.object({ t: z.literal('endTurn'), token: z.string().optional() }),
  z.object({
    t: z.literal('attack'),
    attacker: z.string(),
    /** The creature attacked; missing: the attack goes at `point`, empty ground. */
    target: z.string().optional(),
    point: PointSchema.optional(),
    attack: z.string(),
    smite: z.number().int().min(1).max(9).optional(),
    finisher: z.string().max(80).optional(),
    ...RollChoiceSchema.shape,
  }),
  z.object({ t: z.literal('equip'), token: z.string(), item: z.number().int().nonnegative(), equipped: z.boolean() }),
  z.object({ t: z.literal('hitDie'), token: z.string() }),
  z.object({
    t: z.literal('legendary'),
    token: z.string(),
    option: z.string(),
    target: z.string().optional(),
    ...RollChoiceSchema.shape,
  }),
  z.object({ t: z.literal('lair'), token: z.string(), action: z.string() }),
  z.object({ t: z.literal('exhaustion'), token: z.string(), level: z.number().int().min(0).max(6) }),
  z.object({ t: z.literal('inspiration'), token: z.string(), on: z.boolean() }),
  /** The next level for a character that is only an actor (a token's, or one in the Actors list). */
  z.object({
    t: z.literal('levelUp'),
    token: z.string().optional(),
    actor: z.string().optional(),
    class: z.string().min(1).max(60),
    subclass: z.string().max(60).optional(),
    hp: z.union([z.literal('average'), z.literal('roll')]),
    improvement: z.partialRecord(z.enum(ABILITIES), z.number().int().min(0).max(2)).optional(),
  }),
  z.object({
    t: z.literal('awardXp'),
    tokens: z.array(z.string()).min(1).max(20),
    xp: z.number().int().min(1).max(1_000_000),
  }),
  z.object({
    t: z.literal('requestCheck'),
    tokens: z.array(z.string()).min(1).max(20),
    ...checkKind,
    dc: z.number().int().min(1).max(40).optional(),
    kind: z.enum(['each', 'group', 'contest']),
    versus: z.object(checkKind).optional(),
  }),
  z.object({
    t: z.literal('rollCheck'),
    token: z.string(),
    ...checkKind,
    card: z.string().optional(),
    ...RollChoiceSchema.pick({ edge: true, d20: true, situational: true }).shape,
  }),
  /** The roll dialog asks how a roll's d20 would be rolled as things stand. */
  z.object({ t: z.literal('rollDefaults'), ref: z.string().max(40), roll: RollAskSchema }),
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
    paidBy: z.string().optional(),
    repeat: z.boolean().optional(),
    scroll: z.boolean().optional(),
    item: z.number().int().nonnegative().optional(),
    targets: z.array(z.string()).max(20),
    point: PointSchema.optional(),
    summon: z.string().optional(),
    choice: z.string().optional(),
    form: z.string().optional(),
    ...RollChoiceSchema.shape,
  }),
  z.object({
    t: z.literal('feature'),
    token: z.string(),
    feature: z.string(),
    targets: z.array(z.string()).max(20).optional(),
    point: PointSchema.optional(),
    choice: z.string().optional(),
    /** A pool feature's picked options and entered numbers, and using it as a bonus action instead. */
    picks: z.array(z.string()).max(30).optional(),
    inputs: z.record(z.string(), z.number()).optional(),
    bonus: z.boolean().optional(),
    ...RollChoiceSchema.shape,
  }),
  z.object({ t: z.literal('release'), token: z.string(), hold: z.string() }),
  z.object({ t: z.literal('useItem'), token: z.string(), item: z.string() }),
  z.object({ t: z.literal('react'), offer: z.string(), choice: z.string().optional(), ...RollChoiceSchema.shape }),
  /** Your roll pick for a creature's next roll that the server makes (initiative, a death save); none: normal. */
  z.object({ t: z.literal('rollPick'), token: z.string(), edge: RollChoiceSchema.shape.edge }),
  z.object({ t: z.literal('condition'), token: z.string(), condition: ConditionSchema, on: z.boolean() }),
  z.object({ t: z.literal('combatant'), token: z.string(), on: z.boolean() }),
  z.object({ t: z.literal('initiative'), token: z.string(), value: z.number().int().min(-99).max(99) }),
  /** GM or trusted player: a turn's action, bonus action, reaction and feet of movement left, set by hand. */
  z.object({
    t: z.literal('turnOverride'),
    token: z.string(),
    action: z.boolean().optional(),
    bonus: z.boolean().optional(),
    reaction: z.boolean().optional(),
    move: z.number().int().min(0).max(9999).optional(),
    extra: z.number().int().min(0).max(9).optional(),
  }),
  /** GM: it is this creature's turn now, started afresh. */
  z.object({ t: z.literal('turnTo'), token: z.string() }),
  /** GM: back to the turn before this one. */
  z.object({ t: z.literal('turnBack') }),
  /** GM: the fight's round, set by hand. */
  z.object({ t: z.literal('round'), value: z.number().int().min(1).max(9999) }),
  /** GM: a creature one place earlier (-1) or later (1) in the order. */
  z.object({ t: z.literal('orderMove'), token: z.string(), by: z.union([z.literal(-1), z.literal(1)]) }),
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
  z.object({
    t: z.literal('gameSettings'),
    rules: z.string().max(40).optional(),
    settings: z.record(z.string().max(40), z.string().max(40)),
  }),
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
  z.object({ t: z.literal('spawn'), ...SpawnSchema.shape }),
  z.object({
    t: z.literal('build'),
    scene: z.string(),
    label: z.string().max(40).optional(),
    ops: z.array(OpSchema).max(20000),
    spawns: z.array(SpawnSchema).max(MAX_SPAWNS),
  }),
  z.object({
    t: z.literal('drop'),
    what: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('item'), id: z.string() }),
      z.object({ kind: z.literal('spell'), id: z.string(), rules: EditionSchema }),
      z.object({ kind: z.literal('feature'), id: z.string(), class: z.string(), rules: EditionSchema }),
      z.object({ kind: z.literal('species'), id: z.string(), rules: EditionSchema }),
    ]),
    onto: z.object({ kind: z.enum(['token', 'actor']), id: z.string() }),
    area: z.enum(['inventory', 'spells', 'features']).optional(),
  }),
  z.object({ t: z.literal('give'), from: z.string(), to: z.string(), item: z.string(), spell: z.string().optional() }),
  z.object({
    t: z.literal('trade'),
    from: z.string(),
    to: z.string().optional(),
    item: z.number().int().nonnegative().optional(),
    qty: z.number().int().positive().optional(),
    coins: CurrencySchema.optional(),
  }),
  // The actor itself is checked by GmActions, so a broken one gets a readable refusal.
  z.object({ t: z.literal('saveActor'), actor: z.unknown() }),
  z.object({ t: z.literal('deleteActor'), actor: z.string() }),
  z.object({ t: z.literal('setRole'), player: z.string(), role: RoleSchema }),
  /** GM: the actor a seat plays (it becomes theirs); none to go back to the one they own. */
  z.object({ t: z.literal('setPlays'), player: z.string(), actor: z.string(), plays: z.boolean() }),
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
  z.object({ t: z.literal('plugins') }),
  z.object({ t: z.literal('media') }),
  z.object({ t: z.literal('compendium'), pack: z.string().max(80), compendium: z.string().max(80) }),
  z.object({
    t: z.literal('compendiumDoc'),
    pack: z.string().max(80),
    compendium: z.string().max(80),
    id: z.string().max(120),
  }),
  z.object({
    t: z.literal('findAssets'),
    queries: z.array(AssetQuerySchema).min(1).max(200),
    limit: z.number().int().min(1).max(1000).optional(),
  }),
  z.object({
    t: z.literal('upload'),
    name: z.string().min(1).max(200),
    data: z.string().max(MAX_UPLOAD_BASE64),
    ref: z.string().max(40).optional(),
  }),
  /** GM: the server downloads a picture from the web into the game's uploads. */
  z.object({ t: z.literal('uploadUrl'), url: z.string().min(1).max(2000), ref: z.string().max(40).optional() }),
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
