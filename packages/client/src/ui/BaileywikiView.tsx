import type { BaileywikiImportReport } from '@vtt/shared';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import { api } from '../server-api.ts';
import type { Session } from '../session/session.ts';
import { BaileywikiLibrary } from './BaileywikiLibrary.tsx';
import { BaileywikiBrowser } from './BaileywikiPanel.tsx';
import { Button } from './kit/button.tsx';
import { Card } from './kit/card.tsx';

// The Baileywiki page of the GM's Assets tab, as Baileywiki's browsers in
// Foundry: the library of the pack's prefabs and scenes
// (BaileywikiLibrary.tsx) first, with a button to download it when the
// server hasn't got it yet; under it, folded away, the sign-in and the list
// of Baileywiki's online scenes, each imported scene going straight into
// this game (the Baileywiki pack is turned on for it, so its pictures load).

const PACK = 'baileywiki';

/** Turns the pack on for the game and asks the server for the packs again. */
function usePack(session: Session) {
  return () => {
    if (!session.packs.list.some((p) => p.id === PACK && p.enabled)) session.packs.setPackEnabled(PACK, true);
    session.packs.request();
  };
}

function GetLibrary({ session, onSignIn }: Readonly<{ session: Session; onSignIn: () => void }>) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const refresh = usePack(session);
  const download = async () => {
    setBusy(true);
    setNote(undefined);
    try {
      const got = await api.baileywikiLibrary(session.gameId);
      setNote(t('bwLibrary.got', { n: got.prefabs }));
      refresh();
    } catch (e) {
      setNote(/sign in/i.test((e as Error).message) ? t('bwLibrary.signInFirst') : (e as Error).message);
      onSignIn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col items-start gap-2 p-3">
      <p className="text-sm">{t('bwLibrary.get')}</p>
      <Button size="sm" disabled={busy} onClick={() => void download()}>
        {busy ? t('bwLibrary.downloading') : t('bwLibrary.download')}
      </Button>
      {note && <p className="muted text-sm">{note}</p>}
    </Card>
  );
}

export function BaileywikiView({ session }: Readonly<{ session: Session }>) {
  const [account, setAccount] = useState(false);
  const refresh = usePack(session);
  const pack = session.packs.list.find((p) => p.id === PACK);
  const hasLibrary = !!pack?.compendia.some((c) => c.type === 'prefab');
  const added = (report: BaileywikiImportReport) => {
    refresh();
    for (const entry of report.entries) session.packs.importScene(entry);
  };
  return (
    <div className="lib-scroll flex flex-col gap-2 p-2" aria-label={t('baileywiki.title')} role="region">
      {!hasLibrary && <GetLibrary session={session} onSignIn={() => setAccount(true)} />}
      <BaileywikiLibrary session={session} />
      <Button variant="ghost" size="sm" aria-expanded={account} onClick={() => setAccount(!account)}>
        {t('bwLibrary.account')}
      </Button>
      {account && (
        <>
          <p className="muted text-sm">{t('baileywiki.gameIntro')}</p>
          <BaileywikiBrowser game={session.gameId} onImported={added} />
        </>
      )}
    </div>
  );
}
