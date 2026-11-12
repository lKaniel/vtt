import type { BaileywikiImportReport } from '@vtt/shared';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { BaileywikiLibrary } from './BaileywikiLibrary.tsx';
import { BaileywikiBrowser } from './BaileywikiPanel.tsx';

// The Baileywiki page of the GM's Assets tab: the same sign-in and scene
// list as Setup's box, and each imported scene goes straight into this game
// (the Baileywiki pack is turned on for it, so its pictures load), under
// the library of the pack's prefabs and scenes (BaileywikiLibrary.tsx).

export function BaileywikiView({ session }: Readonly<{ session: Session }>) {
  const added = (report: BaileywikiImportReport) => {
    if (!session.packs.list.some((p) => p.id === report.pack && p.enabled))
      session.packs.setPackEnabled(report.pack, true);
    for (const entry of report.entries) session.packs.importScene(entry);
    session.packs.request();
  };
  return (
    <div className="lib-scroll flex flex-col gap-2 p-2" aria-label={t('baileywiki.title')} role="region">
      <BaileywikiLibrary session={session} />
      <p className="muted text-sm">{t('baileywiki.gameIntro')}</p>
      <BaileywikiBrowser game={session.gameId} onImported={added} />
    </div>
  );
}
