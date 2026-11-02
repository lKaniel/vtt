import { useEffect, useState } from 'react';
import { api } from '../server-api.ts';
import { mcpCommand } from '../claude-bridge.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

/**
 * Lets Claude (Claude Code or Desktop) play as your player at a game: makes
 * a key and shows the command that adds this server. The key is shown once;
 * a new one replaces it.
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
        <Button variant="outline">Connect Claude</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[420px] flex-col gap-2" data-slot="claude-key">
        <p>Claude can look at this game and act as your player, with its rights, over MCP.</p>
        {key ? (
          <>
            <p className="muted">Paste this in a terminal. The key is shown only now.</p>
            <Input readOnly value={mcpCommand(window.location.origin, key)} onFocus={(e) => e.target.select()} />
          </>
        ) : (
          <p className="muted">
            {has ? 'You have a key. A new one stops the old one working.' : 'You have no key yet.'}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={() => void make()}>{has ? 'New key' : 'Make a key'}</Button>
          {has && (
            <Button variant="outline" onClick={() => void drop()}>
              Remove key
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
