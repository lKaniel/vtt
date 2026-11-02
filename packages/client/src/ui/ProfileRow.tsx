import { useState } from 'react';
import { assetUrl } from '../assets.ts';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { ColorInput } from './kit/color-input.tsx';
import { Input } from './kit/input.tsx';
import { Label } from './kit/label.tsx';

/** Your seat's colour (chat, cursor, targets) and picture (beside your chat). */
export function ProfileRow({ session }: Readonly<{ session: Session }>) {
  const you = session.you;
  const [avatar, setAvatar] = useState(you?.avatar ?? '');
  if (!you) return null;
  const save = () => {
    const next = avatar.trim();
    if (next !== (you.avatar ?? '')) session.setProfile({ avatar: next || null });
  };
  return (
    <div className="flex flex-col gap-2" data-slot="profile">
      <Label className="justify-between">
        Your colour
        <ColorInput
          aria-label="Your colour"
          defaultValue={you.color}
          onBlur={(e) => e.target.value !== you.color && session.setProfile({ color: e.target.value })}
        />
      </Label>
      <Label className="flex-col items-stretch gap-1">
        Your picture
        <span className="flex items-center gap-2">
          {you.avatar && (
            <img
              src={assetUrl(you.avatar)}
              alt=""
              className="size-8 rounded-full border border-gold-dim object-cover"
            />
          )}
          <Input
            aria-label="Your picture"
            placeholder="/assets/… or pack://…"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <Button variant="outline" size="sm" onClick={save}>
            Set
          </Button>
        </span>
        <span className="muted text-xs font-normal">Shown beside your chat. Upload pictures in the Assets tab.</span>
      </Label>
    </div>
  );
}
