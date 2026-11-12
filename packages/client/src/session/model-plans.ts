import { slugify } from '@vtt/core';

// A 3D model seen from straight above, saved in the game as a picture: a
// model tile the stamp brush puts down shows it on the flat map (the 3D view
// stands the model there instead), so a map built from Baileywiki's models
// reads in 2D as well as 3D. One picture per model, made the first time
// it is stamped (view3d/thumb-render.ts) and found again by its name.

export interface PlanHost {
  /** The game's files and its packs', as the Assets tab lists them. */
  media(): readonly { src: string }[];
  /** Saves a picture (base64) in the game's uploads; its path. */
  upload(name: string, data: string): Promise<string>;
  /** The model drawn from above as a data URL, or undefined if it doesn't load. */
  render(src: string): Promise<string | undefined>;
}

/** A short hash of the model's path, so two models of one name get two plans. */
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** The file name a model's plan is saved under. */
export function planName(src: string): string {
  const file = src.split('/').at(-1) ?? src;
  return `plan-${slugify(file.replace(/\.[^.]*$/, '')) || 'model'}-${hash(src)}.webp`;
}

export class ModelPlans {
  private made = new Map<string, Promise<string | undefined>>();
  private done = new Map<string, string>();

  constructor(private readonly s: PlanHost) {}

  /** The plan's path in the game, made and saved the first time. */
  // fallow-ignore-next-line unused-class-member -- the stamp brush calls it through StampHost.plans
  of(src: string): Promise<string | undefined> {
    let found = this.made.get(src);
    if (!found) {
      found = this.make(src).then((path) => {
        if (path) this.done.set(src, path);
        else this.made.delete(src);
        return path;
      });
      this.made.set(src, found);
    }
    return found;
  }

  /** The plan if it is ready now. */
  // fallow-ignore-next-line unused-class-member -- the stamp brush calls it through StampHost.plans
  ready(src: string): string | undefined {
    return this.done.get(src);
  }

  private async make(src: string): Promise<string | undefined> {
    const name = planName(src);
    const saved = this.s.media().find((m) => m.src === `/assets/uploads/${name}`);
    if (saved) return saved.src;
    const picture = await this.s.render(src).catch(() => undefined);
    if (!picture) return undefined;
    return this.s.upload(name, picture.slice(picture.indexOf(',') + 1)).catch(() => undefined);
  }
}
