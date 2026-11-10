import type { Session } from '../session/session.ts';
import { t, useLanguage } from '../i18n/index.ts';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';

/** A tile asks you to pick (Monk's dialog buttons): each button runs what it does; closing picks nothing. */
export function TileQuestion({ session }: Readonly<{ session: Session }>) {
  useLanguage();
  const question = session.asks.question;
  if (!question) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && session.asks.dismiss()}>
      <DialogContent data-slot="tile-question" aria-describedby={undefined}>
        <DialogTitle>{question.title ?? t('tileQuestion.title')}</DialogTitle>
        <DialogDescription>{question.text}</DialogDescription>
        <div className="flex flex-wrap justify-end gap-2">
          {question.options.map((label, i) => (
            <Button key={`${i}-${label}`} variant="outline" onClick={() => session.asks.answer(i)}>
              {label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
