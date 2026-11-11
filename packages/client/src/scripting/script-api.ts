import type { Doc, Op, Patch, PluginLoad } from '@vtt/core';
import type { Player, Point } from '@vtt/shared';
import type { ClientMessage, TokenView } from '@vtt/system-dnd5e';
import type { SessionEvents } from '../session/session-events.ts';
import { i18n } from '../i18n/index.ts';
import { Hooks, type HookFn } from './hooks.ts';
import { PluginLoader } from './plugins.ts';
import { runScript } from './run-script.ts';

// The scripting API (docs/scripting.md): what a GM's script macro or a
// plugin sees as `vtt`. It reads what this browser was sent and acts only
// by sending what a click would, so the server checks every step.

/** What the API needs of the session. */
export interface ScriptSession {
  you?: Player;
  readonly tokens: ReadonlyMap<string, TokenView>;
  selected?: string;
  readonly targets: { readonly mine: ReadonlySet<string> };
  readonly docs: { get(coll: string, id: string): Doc | undefined; all(coll: string): Doc[] };
  combat: unknown;
  readonly pluginLoads: readonly PluginLoad[];
  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]): () => void;
  isGm(): boolean;
  send(msg: ClientMessage): void;
  readonly requests: { say(text: string): void; move(token: string, to: Point): void };
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
  showNotice(message: string): void;
  showError(message: string): void;
  readonly journal: { runMacro(macro: string, token?: string): Promise<void> };
  readonly fog: { shown(): { explored(p: Point): boolean } | undefined };
}

export interface VttApi {
  readonly hooks: Pick<Hooks, 'on' | 'once' | 'off'>;
  user(): Player | undefined;
  isGm(): boolean;
  /** The creatures on your scene that you can see. */
  tokens(): TokenView[];
  /** A creature by id, or else by name. */
  token(idOrName: string): TokenView | undefined;
  selected(): TokenView | undefined;
  /** Your targets' ids. */
  targets(): string[];
  /** Says it in chat as if typed: words, or a command such as "/r 1d20+5". */
  chat(text: string): void;
  move(token: string, x: number, y: number): void;
  /** Whether the fog of war on your scene shows (x, y) as explored: yours, or for the GM the players picked. */
  explored(x: number, y: number): boolean;
  docs(coll: string): Doc[];
  doc(coll: string, id: string): Doc | undefined;
  /** Creates, updates and deletes documents in one undo step. */
  edit(ops: readonly Op[], label?: string): void;
  update(coll: string, id: string, patch: Patch, label?: string): void;
  notify(text: string): void;
  /** Runs a macro by id or name, for `token`. */
  runMacro(idOrName: string, token?: string): Promise<void>;
  /** Any client message, as the table's own screens send them (see client-messages.ts). */
  send(msg: ClientMessage): void;
  /** Translations (docs/i18n.md): words by key in the player's language; a plugin adds its own. */
  readonly i18n: {
    t(key: string, vars?: Readonly<Record<string, string | number>>): string;
    lang(): string;
    add(lang: string, words: Readonly<Record<string, string>>): void;
  };
}

/** Session news passed on as hooks: [session event, hook name]. */
const BRIDGED: [keyof SessionEvents, string][] = [
  ['welcome', 'ready'],
  ['chat', 'chat'],
  ['token', 'token'],
  ['tokenGone', 'tokenGone'],
  ['moved', 'moved'],
  ['select', 'select'],
  ['targets', 'targets'],
  ['lighting', 'time'],
];

const macroName = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);

/** The hooks and the `vtt` object of one session, the runner of its script macros and its plugins. */
export class ScriptHost {
  readonly hooks: Hooks;
  readonly vtt: VttApi;
  readonly plugins: PluginLoader;

  constructor(private readonly session: ScriptSession) {
    this.hooks = new Hooks((hook, e) => session.showError(`A ${hook} hook failed: ${messageOf(e)}`));
    this.vtt = makeApi(session, this.hooks);
    for (const [event, hook] of BRIDGED) {
      session.on(event, (...args: unknown[]) => this.hooks.call(hook, ...args));
    }
    session.on('combat', () => this.hooks.call('combat', session.combat));
    this.plugins = new PluginLoader(this.vtt, (id, message) => session.showError(`Plugin ${id} failed: ${message}`));
    // Plugins load once the table is ready, so their main runs with the scene and documents in.
    session.on('welcome', () => void this.plugins.load(session.pluginLoads));
  }

  /** Runs a script macro for `token`; its failure shows as an error, named for the macro. */
  async run(doc: Doc, token?: string): Promise<void> {
    const code = typeof doc.command === 'string' ? doc.command : '';
    try {
      await runScript(code, { vtt: this.vtt, token: token ?? null });
    } catch (e) {
      this.session.showError(`${macroName(doc)}: ${messageOf(e)}`);
    }
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function makeApi(s: ScriptSession, hooks: Hooks): VttApi {
  const tokens = () => [...s.tokens.values()];
  const byName = (coll: string, key: string) => s.docs.get(coll, key) ?? s.docs.all(coll).find((d) => d.name === key);
  return Object.freeze({
    hooks: Object.freeze({
      on: (hook: string, fn: HookFn) => hooks.on(hook, fn),
      once: (hook: string, fn: HookFn) => hooks.once(hook, fn),
      off: (hook: string, fn: HookFn) => hooks.off(hook, fn),
    }),
    user: () => s.you,
    isGm: () => s.isGm(),
    tokens,
    token: (key: string) => s.tokens.get(key) ?? tokens().find((t) => t.name === key),
    selected: () => (s.selected ? s.tokens.get(s.selected) : undefined),
    targets: () => [...s.targets.mine],
    chat: (text: string) => s.requests.say(text),
    move: (token: string, x: number, y: number) => s.requests.move(token, [x, y]),
    explored: (x: number, y: number) => s.fog.shown()?.explored([x, y]) ?? false,
    docs: (coll: string) => s.docs.all(coll),
    doc: (coll: string, id: string) => s.docs.get(coll, id),
    edit: (ops: readonly Op[], label?: string) => s.edits.sendChanges(label ?? 'script', ops),
    update: (coll: string, id: string, patch: Patch, label?: string) => {
      const rev = s.docs.get(coll, id)?.rev;
      s.edits.sendChanges(label ?? 'script', [
        { op: 'update', coll, id, patch, ...(rev === undefined ? {} : { rev }) },
      ]);
    },
    notify: (text: string) => s.showNotice(text),
    runMacro: (key: string, token?: string) => s.journal.runMacro(byName('macros', key)?.id ?? key, token),
    send: (msg: ClientMessage) => s.send(msg),
    i18n: Object.freeze({
      t: (key: string, vars?: Readonly<Record<string, string | number>>) => i18n.t(key, vars),
      lang: () => i18n.lang,
      add: (lang: string, words: Readonly<Record<string, string>>) => i18n.add(lang, words),
    }),
  });
}

/** Puts `vtt` on the page (for the browser console and plugins) while the table is open; returns the undo. */
export function exposeApi(vtt: VttApi, on: { vtt?: VttApi } = globalThis as { vtt?: VttApi }): () => void {
  on.vtt = vtt;
  return () => {
    if (on.vtt === vtt) delete on.vtt;
  };
}
