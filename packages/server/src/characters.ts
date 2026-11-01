import { join } from 'node:path';
import { type Character, CharacterSchema } from '@vtt/system-dnd5e';
import { readJsonDir, removeJson, writeJson } from './json-files.ts';

/** Players' characters, one file each in the data folder's characters/. */
export class CharacterStore {
  private characters = new Map<string, Character>();

  constructor(readonly dir: string) {}

  async load(): Promise<void> {
    for (const raw of await readJsonDir(join(this.dir, 'characters'))) {
      const parsed = CharacterSchema.safeParse(raw);
      if (parsed.success) this.characters.set(parsed.data.id, parsed.data);
    }
  }

  has(id: string): boolean {
    return this.characters.has(id);
  }

  /** The character, if `owner` owns it. */
  owned(id: string, owner: string): Character | undefined {
    const c = this.characters.get(id);
    return c?.owner === owner ? c : undefined;
  }

  listFor(owner: string): Character[] {
    return [...this.characters.values()].filter((c) => c.owner === owner).sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(c: Character): Promise<void> {
    this.characters.set(c.id, c);
    await writeJson(this.path(c.id), c);
  }

  async remove(id: string): Promise<void> {
    this.characters.delete(id);
    await removeJson(this.path(id));
  }

  private path(id: string): string {
    return join(this.dir, 'characters', `${id}.json`);
  }
}
