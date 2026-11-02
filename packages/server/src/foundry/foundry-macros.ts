import type { Macro } from '@vtt/shared';
import { z } from 'zod';
import { each, type FolderLookup, ids, inFolder } from './foundry-entries.ts';
import type { MediaLookup } from './foundry-scene.ts';

// A Foundry world's macros: chat macros become ours; script macros stay
// behind, most of them rolls of an item, which our hotbar does itself.

const str = z.string().optional().catch(undefined).nullable();

const FoundryMacro = z.object({
  name: z.string().min(1),
  type: z.string().catch('chat'),
  command: z.string().catch(''),
  img: str,
  folder: str,
});
type FoundryMacro = z.infer<typeof FoundryMacro>;

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;
const ROLLS_ITEM = /\brollItem\s*\(/;

function macroOf(m: FoundryMacro, id: string, media: MediaLookup, folderOf?: FolderLookup): Macro {
  const img = m.img ? media(m.img) : undefined;
  return { id, name: m.name, kind: 'chat', command: m.command, ...(img && { img }), ...inFolder(folderOf, m.folder) };
}

/** What stayed behind of the script macros. */
function scriptsSkipped(scripts: FoundryMacro[]): string[] {
  const rolls = scripts.filter((m) => ROLLS_ITEM.test(m.command));
  const others = scripts.filter((m) => !rolls.includes(m));
  const names = others.map((m) => m.name).join(', ');
  return [
    ...(rolls.length
      ? [
          `${plural(rolls.length, 'macro')} that ${rolls.length === 1 ? 'rolls' : 'roll'} an item from the hotbar: our hotbar does that already`,
        ]
      : []),
    ...(others.length ? [`${plural(others.length, 'script macro')} (${names}): scripts are Foundry’s own`] : []),
  ];
}

/** Converts a world's macros; `media` finds copied pictures, `folderOf` names folders. */
export function foundryMacros(
  raw: unknown[] | undefined,
  media: MediaLookup,
  folderOf?: FolderLookup,
): { macros: Macro[]; skipped: string[] } {
  const all = each(FoundryMacro, raw);
  const macroId = ids();
  const macros = all
    .filter((m) => m.type === 'chat' && m.command.trim())
    .map((m) => macroOf(m, macroId(m.name, 'macro'), media, folderOf));
  return { macros, skipped: scriptsSkipped(all.filter((m) => m.type === 'script')) };
}
