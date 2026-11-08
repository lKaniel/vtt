import { CheckIcon, LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import { inviteLink } from '../lobby.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';

// Invite links: the address a GM sends so a player lands on the game's join
// screen (with their name picked, for a player's own link). The way remote
// players find their seat on a server out on the internet.

/** This page's address without its #screen: where the server is, as the players reach it. */
const here = () => `${location.origin}${location.pathname}`;

/** The old way to copy, for pages over plain http (a LAN address), where the clipboard API is missing. */
function copyByHand(text: string): Promise<void> {
  const box = document.createElement('textarea');
  box.value = text;
  box.style.position = 'fixed';
  box.style.opacity = '0';
  document.body.append(box);
  box.select();
  // eslint-disable-next-line sonarjs/deprecation, @typescript-eslint/no-deprecated -- the only way to copy outside a secure context
  const ok = document.execCommand('copy');
  box.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('copy refused'));
}

/** Copies `text`, and says so for a moment; `false` when the browser won't. */
function useCopy(): [boolean | undefined, (text: string) => void] {
  const [copied, setCopied] = useState<boolean>();
  const copy = (text: string) => {
    const done = window.isSecureContext ? navigator.clipboard.writeText(text) : copyByHand(text);
    done.then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(undefined), 2000);
      },
      () => setCopied(false),
    );
  };
  return [copied, copy];
}

/** The game's invite link, to read, select or copy. */
export function InviteBox({ game }: Readonly<{ game: string }>) {
  const url = inviteLink(here(), game);
  const [copied, copy] = useCopy();
  return (
    <div className="flex flex-col gap-1" data-slot="invite">
      <span className="text-sm">{t('invite.hint')}</span>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          className="min-w-0 flex-1"
          aria-label={t('invite.link')}
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button variant="outline" onClick={() => copy(url)}>
          {copied ? <CheckIcon /> : <LinkIcon />}
          {t(copied ? 'invite.copied' : 'invite.copy')}
        </Button>
      </div>
      {copied === false && <span className="menu-error">{t('invite.copyFailed')}</span>}
    </div>
  );
}

/** One player's own invite link, copied with a click. */
export function CopyInvite({ game, player }: Readonly<{ game: string; player: { id: string; name: string } }>) {
  const [copied, copy] = useCopy();
  const label = t('invite.copyOf', { name: player.name });
  const url = inviteLink(here(), game, player.id);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={copied === false ? `${t('invite.copyFailed')} ${url}` : label}
      onClick={() => copy(url)}
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
    </Button>
  );
}
