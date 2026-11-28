import type { Doc } from '@vtt/core';
import { slugify } from '@vtt/core';
import { useState } from 'react';
import { blankClass } from '../content/homebrew-edit.ts';
import type { Session } from '../session/session.ts';
import { ClassEditor } from './ClassEditor.tsx';
import { HomebrewSkills } from './HomebrewSkills.tsx';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { t } from '../i18n/index.ts';

// The GM's homebrew classes, in the Compendium tab: make one, open it in the
// editor, and share it so the players' sheets can read it; then the game's own skills.

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const shared = (doc: Doc) => (doc.ownership as { default?: string } | undefined)?.default === 'observer';

export function HomebrewPanel({ session }: Readonly<{ session: Session }>) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string>();
  const docs = session.docs.all('homebrew').filter((d) => d.kind === 'class');
  const taken = (id: string) => !!session.docs.get('homebrew', id);
  const create = () => {
    const id = slugify(name);
    if (!id || taken(id)) return;
    session.journal.createHomebrew({ ...blankClass(id, name.trim()), ownership: { default: 'observer' } });
    setName('');
    setOpen(id);
  };
  const editing = open ? session.docs.get('homebrew', open) : undefined;
  return (
    <div className="flex flex-col gap-2" data-slot="homebrew">
      <div className="flex gap-1">
        <Input
          value={name}
          placeholder={t('homebrew.newName')}
          aria-label={t('homebrew.newName')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <Button variant="outline" size="sm" disabled={!slugify(name) || taken(slugify(name))} onClick={create}>
          {t('homebrew.new')}
        </Button>
      </div>
      <ul className="rows">
        {docs.map((doc) => (
          <li key={doc.id} className="scene-row">
            <Button variant="link" onClick={() => setOpen(doc.id)}>
              {nameOf(doc)}
            </Button>
            <span className="row-actions">
              <Button
                variant="outline"
                size="sm"
                title={shared(doc) ? t('homebrew.unshareTitle') : t('homebrew.shareTitle')}
                onClick={() =>
                  session.journal.patchEntry('homebrew', doc.id, {
                    ownership: shared(doc) ? null : { default: 'observer' },
                  })
                }
              >
                {shared(doc) ? t('homebrew.shared') : t('homebrew.share')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {!docs.length && <p className="muted">{t('homebrew.none')}</p>}
      <p className="muted lib-hint">{t('homebrew.hint')}</p>
      <HomebrewSkills session={session} />
      {editing && <ClassEditor key={editing.id} session={session} doc={editing} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
