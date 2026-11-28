import { assetUrl } from '../assets.ts';
import type { Session } from '../session/session.ts';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';
import { t } from '../i18n/index.ts';

/** A picture the GM showed you, open until you close it. */
export function ImageViewer({ session }: Readonly<{ session: Session }>) {
  const shown = session.journal.shownImage;
  if (!shown) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && session.journal.closeImage()}>
      <DialogContent data-slot="image-viewer" className="w-[min(960px,calc(100vw-32px))] items-center">
        <DialogTitle>{shown.title ?? t('image.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('image.hint')}</DialogDescription>
        <img
          src={assetUrl(shown.src)}
          alt={shown.title ?? ''}
          className="max-h-[calc(100vh-160px)] max-w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
