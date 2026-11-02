import { useEffect, useState } from 'react';
import { ANIMATION_IDS, ANIMATIONS, animationRef, isMediaAnimation } from '@vtt/system-dnd5e';
import type { Session } from '../session.ts';
import { videoChoices } from '../animations.ts';
import { withKey } from './sheet-model.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { SelectField } from './kit/select.tsx';

const LIBRARY = [{ value: '', label: 'Default' }, ...ANIMATION_IDS.map((id) => ({ value: id, label: ANIMATIONS[id] }))];
const fileName = (src: string) => decodeURIComponent(src.split('/').at(-1) ?? src);

/**
 * Which animation each attack and spell plays (Automated Animations' per-item
 * choice): one of the built-in library, or, for the GM, any video of the
 * game's assets and packs (a JB2A pack). A token's controller picks them at
 * the table; the sheet's editor picks an actor's.
 */
export function AnimationsPage({ session, kind, value, update, sheet }: Readonly<SheetProps>) {
  const chosen = value.animations ?? {};
  const pick = (ref: string, animation: string) => {
    if (kind === 'token') {
      session.setAnimation(value.id, ref, animation || undefined);
      return;
    }
    const { [ref]: _old, ...rest } = chosen;
    const next = animation ? { ...rest, [ref]: animation } : rest;
    update((d) => withKey(d, 'animations', Object.keys(next).length ? next : undefined), true);
  };
  const rows = [
    ...sheet.attacks.map((a) => ({ ref: animationRef('attack', a.name), name: a.name })),
    ...(sheet.caster?.spells ?? []).map((s) => ({ ref: animationRef('spell', s.id), name: s.name })),
  ];
  if (!rows.length) return <p className="muted">{value.name} has no attacks or spells to animate.</p>;
  return (
    <ul className="rows" data-slot="animation-picks">
      {rows.map((r) => {
        const current = chosen[r.ref] ?? '';
        const video = isMediaAnimation(current);
        return (
          <li key={r.ref} className="row">
            <span className="row-name">{r.name}</span>
            {video && (
              <span className="row-detail truncate" title={current}>
                {fileName(current)}
              </span>
            )}
            <SelectField
              aria-label={`Animation for ${r.name}`}
              className="w-40"
              value={current}
              onValueChange={(v) => pick(r.ref, v)}
              options={video ? [{ value: current, label: 'Video' }, ...LIBRARY] : LIBRARY}
            />
            {session.isGm() && <VideoPicker session={session} name={r.name} onPick={(src) => pick(r.ref, src)} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Finds a video among the game's and its packs' media by words in its path. */
function VideoPicker({
  session,
  name,
  onPick,
}: Readonly<{ session: Session; name: string; onPick: (src: string) => void }>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open && !session.media.length) session.requestMedia();
  }, [open, session]);
  const found = videoChoices(session.media, query);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={`A video for ${name}`}>
          Video…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[380px] flex-col gap-2" data-slot="video-picker">
        <Input
          autoFocus
          placeholder="Search videos: fire bolt, impact…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!found.length && (
          <span className="muted text-xs">No videos match. Add a pack with .webm files (a JB2A pack).</span>
        )}
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {found.map((m) => (
            <li key={m.src}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start truncate"
                title={m.src}
                onClick={() => {
                  onPick(m.src);
                  setOpen(false);
                }}
              >
                {m.name}
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
