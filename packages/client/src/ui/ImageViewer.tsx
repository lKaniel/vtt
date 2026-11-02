import { assetUrl } from '../assets.ts';
import type { Session } from '../session.ts';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';

/** A picture the GM showed you, open until you close it. */
export function ImageViewer({ session }: Readonly<{ session: Session }>) {
  const shown = session.shownImage;
  if (!shown) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && session.closeImage()}>
      <DialogContent data-slot="image-viewer" className="w-[min(960px,calc(100vw-32px))] items-center">
        <DialogTitle>{shown.title ?? 'The GM shows you'}</DialogTitle>
        <DialogDescription className="sr-only">A picture the GM showed the table.</DialogDescription>
        <img
          src={assetUrl(shown.src)}
          alt={shown.title ?? ''}
          className="max-h-[calc(100vh-160px)] max-w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
