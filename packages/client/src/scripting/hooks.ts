// Hooks, as in Foundry: named moments scripts and plugins listen for
// (`vtt.hooks.on('chat', fn)`). One listener failing never stops the others
// or the table; the failure is reported instead.

export type HookFn = (...args: never[]) => unknown;

export class Hooks {
  private readonly listeners = new Map<string, Set<HookFn>>();

  constructor(private readonly failed: (hook: string, error: unknown) => void = defaultFailed) {}

  /** Listens for `hook`; the returned function stops listening. */
  on(hook: string, fn: HookFn): () => void {
    const set = this.listeners.get(hook) ?? new Set();
    this.listeners.set(hook, set);
    set.add(fn);
    return () => this.off(hook, fn);
  }

  /** Listens for the next `hook` only. */
  once(hook: string, fn: HookFn): () => void {
    const off = this.on(hook, (...args: never[]) => {
      off();
      return fn(...args);
    });
    return off;
  }

  off(hook: string, fn: HookFn): void {
    this.listeners.get(hook)?.delete(fn);
  }

  /** Calls every listener of `hook` with `args`, each on its own. */
  call(hook: string, ...args: unknown[]): void {
    for (const fn of [...(this.listeners.get(hook) ?? [])]) {
      try {
        (fn as (...a: unknown[]) => unknown)(...args);
      } catch (e) {
        this.failed(hook, e);
      }
    }
  }

  /** Lets go of every listener (the table was left). */
  clear(): void {
    this.listeners.clear();
  }
}

function defaultFailed(hook: string, error: unknown): void {
  console.error(`[hooks] a ${hook} listener failed:`, error);
}
