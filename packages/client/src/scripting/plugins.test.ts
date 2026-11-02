import { describe, expect, it, vi } from 'vitest';
import { PluginLoader } from './plugins.ts';

// Plugins (docs/plugins.md): each client loads the main module of every
// plugin its game turned on, and calls its default export with `vtt`.

const vtt = { tag: 'api' };
const plugin = (id: string, styles: string[] = []) => ({ id, name: id, main: `/plugins/${id}/main.js`, styles });

function loaderWith(modules: Record<string, unknown>) {
  const failed = vi.fn();
  const styles: string[] = [];
  const loader = new PluginLoader(vtt, failed);
  loader.importModule = (url) =>
    url in modules ? Promise.resolve(modules[url]) : Promise.reject(new Error(`404 ${url}`));
  loader.addStyle = (url) => styles.push(url);
  return { loader, failed, styles };
}

describe('the plugin loader', () => {
  it('adds each plugin’s styles and calls its main module with vtt, once per page', async () => {
    const start = vi.fn();
    const { loader, styles } = loaderWith({ '/plugins/alert/main.js': { default: start } });
    await loader.load([plugin('alert', ['/plugins/alert/a.css'])]);
    await loader.load([plugin('alert', ['/plugins/alert/a.css'])]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(vtt);
    expect(styles).toEqual(['/plugins/alert/a.css']);
    expect(loader.loaded()).toEqual(['alert']);
  });

  it('reports a plugin that fails to load or start, and still loads the rest', async () => {
    const fine = vi.fn();
    const { loader, failed } = loaderWith({
      '/plugins/broken/main.js': {
        default: () => {
          throw new Error('bad');
        },
      },
      '/plugins/fine/main.js': { default: fine },
    });
    await loader.load([plugin('missing'), plugin('broken'), plugin('fine')]);
    expect(failed.mock.calls).toEqual([
      ['missing', '404 /plugins/missing/main.js'],
      ['broken', 'bad'],
    ]);
    expect(fine).toHaveBeenCalled();
  });

  it('takes a module without a default export as one that set itself up', async () => {
    const { loader, failed } = loaderWith({ '/plugins/quiet/main.js': {} });
    await loader.load([plugin('quiet')]);
    expect(failed).not.toHaveBeenCalled();
    expect(loader.loaded()).toEqual(['quiet']);
  });
});
