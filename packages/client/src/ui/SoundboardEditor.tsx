import type { Doc } from '@vtt/core';
import { Volume2Icon, XIcon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { AddTrack } from './AddTrack.tsx';
import { Button } from './kit/button.tsx';

// A soundboard: one button per sound. A press plays it once for everyone at
// the table (the server sends it to every seat, on every scene); the board
// itself never plays. The window stays open beside the table while you play.

interface Sound {
  id: string;
  name: string;
}

export function SoundboardEditor({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const sounds = (doc.tracks as Sound[] | undefined) ?? [];
  return (
    <div className="flex flex-col gap-3">
      {sounds.length ? (
        <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0">
          {sounds.map((s) => (
            <li key={s.id} className="group relative">
              <Button
                variant="outline"
                className="h-auto min-h-12 w-full justify-start gap-1.5 py-1.5 pr-6 text-left whitespace-normal"
                title={t('board.playHint', { sound: s.name })}
                onClick={() => session.journal.playSound(doc.id, s.id)}
              >
                <Volume2Icon />
                <span className="line-clamp-2 break-words">{s.name}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-0.5 right-0.5 size-5 opacity-50 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={t('board.remove', { sound: s.name })}
                title={t('board.remove', { sound: s.name })}
                onClick={() => session.journal.removeTrack(doc.id, s.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted m-0 text-sm">{t('board.empty')}</p>
      )}
      <AddTrack session={session} doc={doc} />
    </div>
  );
}
