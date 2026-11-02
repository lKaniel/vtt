import type { Doc } from '@vtt/core';
import { isGm, navLabel, navScenes, sceneThumb } from '@vtt/shared';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '../assets.ts';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';

/**
 * GM: the scene navigation bar under the top bar. It holds the scenes marked
 * for it (Scenes tab: "In the navigation bar"), the game's and the one you
 * are on. Click one to look at it; the play button moves the game there.
 */
export function SceneNav({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState(true);
  if (!session.you || !isGm(session.you)) return null;
  const scenes = navScenes(session.docs, { active: session.activeScene, here: session.scene });
  if (scenes.length < 2) return null;
  return (
    <nav
      data-slot="scene-nav"
      aria-label="Scenes"
      className="absolute top-12 left-2 z-20 flex max-w-[60vw] items-center gap-1"
    >
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={open ? 'Hide the scene bar' : 'Show the scene bar'}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </Button>
      {open && (
        <div className="flex flex-wrap items-center gap-1">
          {scenes.map((doc) => (
            <SceneChip key={doc.id} session={session} doc={doc} />
          ))}
        </div>
      )}
    </nav>
  );
}

function SceneChip({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const here = session.scene === doc.id;
  const active = session.activeScene === doc.id;
  const thumb = sceneThumb(session.docs, doc.id);
  return (
    <div className="flex items-center">
      <Button
        size="sm"
        variant={here ? 'default' : 'outline'}
        aria-pressed={here}
        title={active ? 'The game is here' : 'Look at this scene; the players stay where they are'}
        onClick={() => session.viewScene(doc.id)}
      >
        {thumb && <img src={assetUrl(thumb)} alt="" className="h-5 w-8 rounded-sm object-cover" />}
        {active && <PlayIcon className="text-gold-bright" />}
        {navLabel(doc)}
      </Button>
      {!active && here && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Play here"
          title="Move the game and everyone here"
          onClick={() => session.activateScene(doc.id)}
        >
          <PlayIcon />
        </Button>
      )}
    </div>
  );
}
