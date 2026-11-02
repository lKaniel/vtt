// A script macro's code, run as the body of an async function whose
// parameters are the names it is given (`vtt`, `token`). It runs in the
// browser of the GM who wrote it, with the GM's rights and nothing more:
// everything it does goes through the session to the server.

type AsyncFn = new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;

/** Runs `code` with `names` in scope; resolves to what it returns. A syntax error rejects too. */
export async function runScript(code: string, names: Record<string, unknown>): Promise<unknown> {
  // The constructor of async functions, taken from this one.
  const AsyncFunction = (Object.getPrototypeOf(runScript) as { constructor: AsyncFn }).constructor;
  const fn = new AsyncFunction(...Object.keys(names), code);
  return await fn(...Object.values(names));
}
