// `vtt` is the scripting API an open table puts on the page
// (client/src/scripting/script-api.ts); specs read it in page.evaluate.

interface E2eToken {
  id: string;
  name: string;
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  hidden?: boolean;
  elevation?: number;
  img?: string;
  inventory?: { item: string; qty: number; spell?: string }[];
  hotbar?: (string | null)[];
  stats?: { species?: string };
}

interface E2eVtt {
  user(): { id: string; name: string; role: string } | undefined;
  isGm(): boolean;
  tokens(): E2eToken[];
  token(idOrName: string): E2eToken | undefined;
  selected(): E2eToken | undefined;
  chat(text: string): void;
  move(token: string, x: number, y: number): void;
  explored(x: number, y: number): boolean;
  docs(coll: string): ({ id: string } & Record<string, unknown>)[];
  doc(coll: string, id: string): ({ id: string } & Record<string, unknown>) | undefined;
  update(coll: string, id: string, patch: Record<string, unknown>, label?: string): void;
  send(message: Record<string, unknown>): void;
  hooks: { on(hook: string, fn: (...args: unknown[]) => void): unknown };
}

interface Window {
  /** What a spec collected from a hook. */
  seen?: unknown[];
}

declare const vtt: E2eVtt;
