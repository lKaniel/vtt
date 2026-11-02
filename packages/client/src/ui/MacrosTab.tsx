import type { Doc } from '@vtt/core';
import { isScriptMacro } from '@vtt/shared';
import { useState } from 'react';
import { TILE_DRAG } from '../hotbar.ts';
import type { Session } from '../session.ts';
import { t } from '../i18n/index.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Textarea } from './kit/textarea.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const textOf = (doc: Doc, key: string) => (typeof doc[key] === 'string' ? doc[key] : '');
const shared = (doc: Doc) => (doc.ownership as { default?: string } | undefined)?.default === 'observer';

/**
 * Chat macros, as in Foundry: each line of one is posted to chat as if typed
 * ("/r 1d20+5", or plain words). Run one here, or drag it onto the hotbar.
 * The GM's macros are theirs until shared; players make their own.
 */
export function MacrosTab({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState<string>();
  const macros = session.docs.all('macros').sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const canMake = session.isGm() || session.you?.role !== 'observer';
  return (
    <div className="scenes-tab">
      {canMake && (
        <Button variant="outline" size="sm" onClick={() => session.createEntry('macro')}>
          {t('macros.new')}
        </Button>
      )}
      <ul className="rows">
        {macros.map((doc) => (
          <MacroRow
            key={doc.id}
            session={session}
            doc={doc}
            open={open === doc.id}
            onToggle={() => setOpen(open === doc.id ? undefined : doc.id)}
          />
        ))}
      </ul>
      {!macros.length && <p className="muted">{t('macros.none')}</p>}
    </div>
  );
}

interface RowProps {
  session: Session;
  doc: Doc;
  open: boolean;
  onToggle: () => void;
}

/** One macro: its name opens the editor (for whoever may change it); drag the row onto the hotbar. */
function MacroRow({ session, doc, open, onToggle }: Readonly<RowProps>) {
  const share = () => session.patchEntry('macros', doc.id, { ownership: shared(doc) ? null : { default: 'observer' } });
  return (
    <li
      className="scene-row"
      draggable
      onDragStart={(e) => e.dataTransfer.setData(TILE_DRAG, JSON.stringify({ ref: `macro:${doc.id}` }))}
      title={t('macros.dragHint')}
    >
      <Button variant="link" onClick={onToggle}>
        {nameOf(doc)}
      </Button>
      <span className="row-actions">
        {isScriptMacro(doc) && <Badge title={t('macros.scriptHint')}>{t('macros.script')}</Badge>}
        <Button variant="outline" size="sm" onClick={() => void session.runMacro(doc.id, session.selected)}>
          {t('macros.run')}
        </Button>
        {session.isGm() && !isScriptMacro(doc) && (
          <Button
            variant="outline"
            size="sm"
            onClick={share}
            title={t(shared(doc) ? 'macros.sharedHint' : 'macros.shareHint')}
          >
            {t(shared(doc) ? 'macros.shared' : 'macros.share')}
          </Button>
        )}
      </span>
      {open && session.canEditMacro(doc.id) && <MacroEditor session={session} doc={doc} />}
    </li>
  );
}

const PLACEHOLDER = {
  chat: 'Well met, friends!\n/r 1d20+5 persuasion',
  script: 'for (const t of vtt.tokens()) vtt.chat(`${t.name} is here`);',
};

function MacroEditor({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const [name, setName] = useState(nameOf(doc));
  const [command, setCommand] = useState(textOf(doc, 'command'));
  const [img, setImg] = useState(textOf(doc, 'img'));
  const kind = isScriptMacro(doc) ? 'script' : 'chat';
  const patch = (p: Record<string, unknown>) => session.patchEntry('macros', doc.id, p);
  return (
    <div className="table-edit">
      <Input
        value={name}
        aria-label={t('macros.name')}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && patch({ name: name.trim() })}
      />
      {session.isGm() && (
        <ToggleGroup
          type="single"
          value={kind}
          onValueChange={(v) => v && patch(v === 'script' ? { kind: v, ownership: null } : { kind: v })}
        >
          <ToggleGroupItem value="chat">{t('macros.kind.chat')}</ToggleGroupItem>
          <ToggleGroupItem value="script">{t('macros.kind.script')}</ToggleGroupItem>
        </ToggleGroup>
      )}
      <Textarea
        value={command}
        aria-label={t(kind === 'script' ? 'macros.code' : 'macros.chatLines')}
        className={kind === 'script' ? 'font-mono text-xs' : undefined}
        placeholder={PLACEHOLDER[kind]}
        onChange={(e) => setCommand(e.target.value)}
        onBlur={() => patch({ command })}
      />
      <Input
        value={img}
        aria-label="Picture"
        placeholder={t('macros.picture')}
        onChange={(e) => setImg(e.target.value)}
        onBlur={() => patch({ img: img.trim() || null })}
      />
      <p className="muted">{t(`macros.help.${kind}`)}</p>
      <Button variant="outline" size="sm" onClick={() => session.deleteMacro(doc.id)}>
        {t('macros.delete')}
      </Button>
    </div>
  );
}
