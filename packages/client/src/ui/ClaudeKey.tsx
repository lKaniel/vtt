import { BotIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../server-api.ts';
import { mcpCommand } from '../claude-bridge.ts';
import { t } from '../i18n/index.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

/**
 * Lets Claude (Claude Code or Desktop) play as your player at a game: makes
 * a key and shows the command that adds this server. The key is shown once;
 * a new one replaces it. It sits in the table's top bar.
 */
export function ClaudeKey({ game }: Readonly<{ game: string }>) {
  const [has, setHas] = useState<boolean>();
  const [key, setKey] = useState<string>();
  useEffect(() => {
    api.hasMcpKey(game).then(setHas, () => setHas(false));
  }, [game]);
  const make = async () => {
    setKey(await api.newMcpKey(game));
    setHas(true);
  };
  const drop = async () => {
    await api.dropMcpKey(game);
    setKey(undefined);
    setHas(false);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('claude.connect')} title={t('claude.connect')}>
          <BotIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2"
        data-slot="claude-key"
      >
        <p>{t('claude.about')}</p>
        {key ? (
          <>
            <p className="muted">{t('claude.paste')}</p>
            <Input readOnly value={mcpCommand(window.location.origin, key)} onFocus={(e) => e.target.select()} />
          </>
        ) : (
          <p className="muted">{t(has ? 'claude.hasKey' : 'claude.noKey')}</p>
        )}
        <div className="flex gap-2">
          <Button onClick={() => void make()}>{t(has ? 'claude.newKey' : 'claude.makeKey')}</Button>
          {has && (
            <Button variant="outline" onClick={() => void drop()}>
              {t('claude.removeKey')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
