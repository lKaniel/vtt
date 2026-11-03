import type { BaileywikiImportReport, BaileywikiScene, BaileywikiStatus } from '@vtt/shared';
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n/index.ts';
import { api } from '../server-api.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Card } from './kit/card.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Input } from './kit/input.tsx';

// The admin's Baileywiki box in Setup: sign the server in with the code
// content.baileywiki.com shows, pick scenes from Baileywiki's online
// compendia, and download them into the private Baileywiki pack
// (server/foundry/baileywiki-import.ts). Baileywiki decides what the
// membership unlocks.

const keyOf = (s: { compendium: string; id: string }) => `${s.compendium}.${s.id}`;

function SignIn({ status, onSigned }: Readonly<{ status: BaileywikiStatus; onSigned: (s: BaileywikiStatus) => void }>) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError(undefined);
    try {
      onSigned(await api.baileywikiSignIn(code));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => void submit(e)}>
      <Button asChild variant="outline">
        <a href={status.signInUrl} target="_blank" rel="noreferrer">
          {t('baileywiki.open')}
        </a>
      </Button>
      <p className="menu-note">{t('baileywiki.codeHint')}</p>
      <label className="auth-field">
        <span>{t('baileywiki.code')}</span>
        <Input value={code} type="password" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
      </label>
      {error && <p className="menu-error">{error}</p>}
      <Button type="submit" disabled={!code.trim()}>
        {t('baileywiki.signIn')}
      </Button>
    </form>
  );
}

function SceneRow({
  scene,
  picked,
  onPick,
}: Readonly<{ scene: BaileywikiScene; picked: boolean; onPick: (on: boolean) => void }>) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <Checkbox checked={picked} onCheckedChange={(on) => onPick(on === true)} aria-label={scene.name} />
      {scene.thumb && <img src={scene.thumb} alt="" className="h-8 w-12 rounded-sm object-cover" loading="lazy" />}
      <span className="flex-1">{scene.name}</span>
      {scene.imported && <Badge variant="muted">{t('baileywiki.inPack')}</Badge>}
    </label>
  );
}

function Report({ report }: Readonly<{ report: BaileywikiImportReport }>) {
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="baileywiki-report">
      <p>{t('baileywiki.done', { scenes: report.scenes, media: report.media })}</p>
      {report.skipped.length > 0 && (
        <Card className="max-h-40 overflow-y-auto p-2 text-xs">
          <p className="mb-1 font-semibold">{t('baileywiki.leftOut')}</p>
          <ul className="list-disc pl-4">
            {report.skipped.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function useScenes() {
  const [scenes, setScenes] = useState<BaileywikiScene[]>();
  const [error, setError] = useState<string>();
  const load = () => {
    setError(undefined);
    api.baileywikiScenes().then(setScenes, (e: unknown) => setError((e as Error).message));
  };
  return { scenes, error, load };
}

function ScenePicker() {
  const { scenes, error, load } = useScenes();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BaileywikiImportReport>();
  const shown = useMemo(
    () => (scenes ?? []).filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase())),
    [scenes, query],
  );
  const pick = (key: string, on: boolean) =>
    setPicked((old) => {
      const next = new Set(old);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const run = async () => {
    setBusy(true);
    try {
      const chosen = (scenes ?? []).filter((s) => picked.has(keyOf(s)));
      setReport(await api.baileywikiImport(chosen.map(({ compendium, id }) => ({ compendium, id }))));
      setPicked(new Set());
      load();
    } finally {
      setBusy(false);
    }
  };
  if (!scenes)
    return (
      <>
        {error && <p className="menu-error">{error}</p>}
        <Button variant="outline" onClick={load}>
          {t('baileywiki.showScenes')}
        </Button>
      </>
    );
  return (
    <div className="flex flex-col gap-2">
      <Input value={query} placeholder={t('baileywiki.search')} onChange={(e) => setQuery(e.target.value)} />
      <Card className="max-h-72 overflow-y-auto px-2 py-1">
        {shown.map((s) => (
          <SceneRow key={keyOf(s)} scene={s} picked={picked.has(keyOf(s))} onPick={(on) => pick(keyOf(s), on)} />
        ))}
        {!shown.length && <p className="menu-note">{t('baileywiki.none')}</p>}
      </Card>
      <Button disabled={busy || !picked.size} onClick={() => void run()}>
        {busy ? t('baileywiki.importing') : t('baileywiki.import', { n: picked.size })}
      </Button>
      {report && <Report report={report} />}
    </div>
  );
}

export function BaileywikiPanel() {
  const [status, setStatus] = useState<BaileywikiStatus>();
  useEffect(() => {
    api.baileywiki().then(setStatus, () => undefined);
  }, []);
  if (!status) return null;
  const signOut = async () => setStatus(await api.baileywikiSignOut());
  return (
    <section className="auth frame lobby-form" aria-label={t('baileywiki.title')}>
      <h2 className="lobby-heading">{t('baileywiki.title')}</h2>
      <p className="menu-note">{t('baileywiki.intro')}</p>
      {status.signedIn ? (
        <>
          <p className="text-sm">{t('baileywiki.signedIn', { tier: status.tier })}</p>
          <p className="menu-note">{t('baileywiki.private')}</p>
          <ScenePicker />
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('baileywiki.signOut')}
          </Button>
        </>
      ) : (
        <SignIn status={status} onSigned={setStatus} />
      )}
    </section>
  );
}
