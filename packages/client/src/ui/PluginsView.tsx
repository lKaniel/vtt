import type { PluginInfo } from '@vtt/core';
import { useEffect } from 'react';
import type { Session } from '../session.ts';
import { t } from '../i18n/index.ts';
import { Checkbox } from './kit/checkbox.tsx';

/**
 * GM: the plugins installed on the server that this game may use. Turning
 * one on makes every client at the game load it when they next join; one
 * turned off stays loaded until the page reloads. See docs/plugins.md.
 */
export function PluginsView({ session }: Readonly<{ session: Session }>) {
  useEffect(() => {
    session.packs.requestPlugins();
  }, [session]);
  return (
    <div className="lib-scroll">
      {session.packs.pluginProblems.length > 0 && (
        <ul className="asset-problems">
          {session.packs.pluginProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <ul className="lib-list">
        {session.packs.plugins.map((p) => (
          <PluginRow key={p.id} session={session} plugin={p} />
        ))}
      </ul>
      <p className="muted lib-hint">{t('plugins.hint')}</p>
    </div>
  );
}

function PluginRow({ session, plugin }: Readonly<{ session: Session; plugin: PluginInfo }>) {
  const sub = [`v${plugin.version}`, plugin.author, plugin.description].filter(Boolean).join(' · ');
  return (
    <li className="lib-row lib-entry">
      <div className="lib-main pack-head">
        <Checkbox
          checked={plugin.enabled}
          onCheckedChange={(on) => session.packs.setPluginEnabled(plugin.id, on === true)}
          aria-label={t('plugins.use', { name: plugin.name })}
        />
        <span className="lib-text">
          <span className="lib-name">{plugin.name}</span>
          <span className="lib-sub">{sub}</span>
        </span>
      </div>
    </li>
  );
}
