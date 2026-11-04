import { useEffect, useReducer } from 'react';
import { assetUrl } from '../assets.ts';
import { t } from '../i18n/index.ts';
import { objectOf } from '../play/objects.ts';
import { objectUses } from '../play/object-uses.ts';
import type { Session } from '../session/session.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';

// The inspect card, as BG3's: a door's, chest's or lever's name, picture,
// state and description, with what can be done with it. Opened from the
// object's right-click menu (play/object-uses.ts).

export function InspectCard({ session }: Readonly<{ session: Session }>) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // A door swinging changes its chunk, not the session: redraw for that too.
  useEffect(() => session.on('chunk', redraw), [session]);
  const ref = session.inspect.current;
  const obj = ref && objectOf(session, ref);
  if (!obj) return null;
  const close = () => session.inspect.open(undefined);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent data-slot="inspect-card" className="w-[min(420px,calc(100vw-32px))]">
        <DialogTitle className="flex items-center gap-2">
          {obj.name}
          {obj.state && <Badge variant="muted">{obj.state}</Badge>}
        </DialogTitle>
        <DialogDescription className="sr-only">{t('object.inspectHint')}</DialogDescription>
        {obj.img && <img src={assetUrl(obj.img)} alt="" className="mx-auto max-h-48 max-w-full object-contain" />}
        <p className="text-sm whitespace-pre-wrap">{obj.description ?? t('object.nothing')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {objectUses(session, obj).map((use) => (
            <Button
              key={use.label}
              variant="outline"
              size="sm"
              onClick={() => {
                close();
                use.run();
              }}
            >
              {use.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
