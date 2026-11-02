import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { gamePluginIssues, pluginInfos, pluginLoads } from './game-plugins.ts';
import { PluginStore } from './plugin-store.ts';

// Plugins (docs/plugins.md): code a server admin installs in
// data/plugins/<id>/ and a GM turns on per game (game.json `plugins`).

let dir: string;
let plugins: PluginStore;

async function put(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), typeof data === 'string' ? data : JSON.stringify(data));
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-plugins-'));
  await put('dice-so-nice/plugin.json', {
    id: 'dice-so-nice',
    name: 'Dice so nice',
    version: '2.0.0',
    styles: ['dice.css'],
    languages: [{ lang: 'de', name: 'Deutsch', path: 'lang/de.json' }],
  });
  await put('dice-so-nice/main.js', 'export default () => {};');
  await put('dice-so-nice/dice.css', '.die {}');
  await put('crit-cards/plugin.json', { id: 'crit-cards', name: 'Crit cards', system: 'dnd5e', main: 'src/index.js' });
  await put('stars/plugin.json', { id: 'stars', name: 'Stars', system: 'starfinder' });
  await put('wrong-folder/plugin.json', { id: 'other', name: 'Other' });
  await put('broken/plugin.json', { id: 'broken' });
  await put('notes/readme.txt', 'not a plugin');
  plugins = new PluginStore(dir);
  await plugins.load();
});

describe('installed plugins', () => {
  it('are read from their folders, with what could not be read reported', () => {
    expect(plugins.list().map((p) => p.id)).toEqual(['crit-cards', 'dice-so-nice', 'stars']);
    expect(plugins.get('crit-cards')).toMatchObject({ main: 'src/index.js', styles: [], version: '1.0.0' });
    expect(plugins.problems).toEqual([
      expect.stringMatching(/^broken\/plugin\.json: name /),
      'wrong-folder/plugin.json: its id is "other" but its folder is "wrong-folder"',
    ]);
  });

  it('serve the files inside their folder only', () => {
    expect(plugins.file('dice-so-nice', 'main.js')).toBe(join(dir, 'dice-so-nice', 'main.js'));
    expect(plugins.file('dice-so-nice', '../crit-cards/plugin.json')).toBeUndefined();
    expect(plugins.file('gone', 'main.js')).toBeUndefined();
  });
});

const game = (ids?: string[]) => ({ system: 'dnd5e', ...(ids ? { plugins: ids } : {}) });

describe('the plugins of a game', () => {
  it('lists those it may use (any system or its own), marking the ones turned on', () => {
    expect(pluginInfos(plugins, game(['crit-cards'])).map((p) => [p.id, p.enabled])).toEqual([
      ['crit-cards', true],
      ['dice-so-nice', false],
    ]);
  });

  it('tells every client what to load: the main module and styles of each turned on', () => {
    expect(pluginLoads(plugins, game(['dice-so-nice', 'crit-cards', 'stars', 'gone']))).toEqual([
      {
        id: 'dice-so-nice',
        name: 'Dice so nice',
        main: '/plugins/dice-so-nice/main.js',
        styles: ['/plugins/dice-so-nice/dice.css'],
        languages: [{ lang: 'de', name: 'Deutsch', url: '/plugins/dice-so-nice/lang/de.json' }],
      },
      { id: 'crit-cards', name: 'Crit cards', main: '/plugins/crit-cards/src/index.js', styles: [], languages: [] },
    ]);
    expect(pluginLoads(plugins, game())).toEqual([]);
  });

  it('warns about plugins a game names that the server lacks or that are for another system', () => {
    expect(gamePluginIssues(plugins, game(['dice-so-nice', 'gone', 'stars']))).toEqual([
      'plugin "gone" is not installed (data/plugins/gone/)',
      'plugin "stars" is for starfinder, not dnd5e',
    ]);
  });
});
