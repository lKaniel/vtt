// Pictures and sizes of 3D models for the Assets tab and the stamp brush: a
// model is loaded and drawn once (thumb-render.ts), one at a time so a grid
// of hundreds doesn't stall the table, and kept in this browser
// (IndexedDB), so the next visit shows them at once.

/** A model's picture (a data URL) and its size in its own units: across, up, deep. */
export interface ModelInfo {
  thumb?: string;
  size?: [number, number, number];
}

/** Where pictures outlive the page; every call may fail (a private window). */
export interface InfoStore {
  get(src: string): Promise<ModelInfo | undefined>;
  set(src: string, info: ModelInfo): Promise<void>;
}

type Render = (src: string) => Promise<ModelInfo | undefined>;

export class ModelInfos {
  private known = new Map<string, Promise<ModelInfo>>();
  private done = new Map<string, ModelInfo>();
  /** The last render queued: the next waits for it. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly render: Render,
    private readonly store?: InfoStore,
  ) {}

  /** The model's picture and size, loading it the first time. */
  of(src: string): Promise<ModelInfo> {
    let found = this.known.get(src);
    if (!found) {
      found = this.fetch(src).then((info) => {
        this.done.set(src, info);
        return info;
      });
      this.known.set(src, found);
    }
    return found;
  }

  /** What is known of it already, without loading it. */
  peek(src: string): ModelInfo | undefined {
    return this.done.get(src);
  }

  private async fetch(src: string): Promise<ModelInfo> {
    const kept = await this.store?.get(src).catch(() => undefined);
    if (kept) return kept;
    const made = this.queue.then(() => this.render(src)).catch(() => undefined);
    this.queue = made;
    const info = (await made) ?? {};
    if (info.size) await this.store?.set(src, info).catch(() => undefined);
    return info;
  }
}

const DB = 'vtt-model-thumbs';
const TABLE = 'models';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
  });
}

let opened: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
  });
  return opened;
}

/** This browser's IndexedDB. */
const browserStore: InfoStore = {
  get: async (src) =>
    request((await database()).transaction(TABLE).objectStore(TABLE).get(src) as IDBRequest<ModelInfo | undefined>),
  set: async (src, info) => {
    await request((await database()).transaction(TABLE, 'readwrite').objectStore(TABLE).put(info, src));
  },
};

let shared: ModelInfos | undefined;

/** The page's model pictures, drawn with three.js (loaded the first time one is asked for). */
export function modelInfos(): ModelInfos {
  shared ??= new ModelInfos(async (src) => (await import('./thumb-render.ts')).renderModel(src), browserStore);
  return shared;
}
