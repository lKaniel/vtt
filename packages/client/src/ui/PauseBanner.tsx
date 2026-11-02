import { PauseIcon, PlayIcon } from 'lucide-react';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';

/** Told to everyone while the GM has the game paused. */
export function PauseBanner({ session }: Readonly<{ session: Session }>) {
  if (!session.paused) return null;
  return (
    <div
      data-slot="pause-banner"
      role="status"
      className="pointer-events-none fixed top-24 left-1/2 z-30 -translate-x-1/2 px-8 py-2 font-display text-lg tracking-widest text-gold-bright art-panel [text-shadow:0_1px_2px_#000]"
    >
      Game paused
    </div>
  );
}

/** GM: pauses the game, or lets it go on. */
export function PauseButton({ session }: Readonly<{ session: Session }>) {
  if (!session.isGm()) return null;
  const paused = session.paused;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={paused ? 'Resume the game' : 'Pause the game'}
      title={paused ? 'Resume the game' : 'Pause the game: players can’t act'}
      onClick={() => session.setPaused(!paused)}
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
    </Button>
  );
}
