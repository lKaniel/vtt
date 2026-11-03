import type { Doc } from '@vtt/core';
import { isScriptMacro } from '@vtt/shared';
import { useState } from 'react';
import { TILE_DRAG } from '../play/hotbar.ts';
import type { Session } from '../session/session.ts';
import { t } from '../i18n/index.ts';
import { Badge } from './kit/badge.tsx';
import { LockIcon, PencilIcon, PlayIcon, PlusIcon, SquareTerminalIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { assetUrl } from '../assets.ts';
import { Directory, type DirItem } from './directory/Directory.tsx';
import type { MenuEntry } from './directory/menu.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogTitle } from './kit/dialog.tsx';
import { Input } from './kit/input.tsx';
import { Textarea } from './kit/textarea.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);
const textOf = (doc: Doc, key: string) => (typeof doc[key] === 'string' ? doc[key] : '');
const shared = (doc: Doc) => (doc.ownership as { default?: string } | undefined)?.default === 'observer';

function macroPicture(doc: Doc) {
  const img = textOf(doc, 'img');
  if (img) return <img src={assetUrl(img)} alt="" className="object-cover" draggable={false} />;
  return (
    <span className="flex items-center justify-center text-gold">
      <SquareTerminalIcon className="size-4" />
    </span>
  );
}

/** The GM shares a chat macro with the players, or stops. */
function shareCommand(session: Session, doc: Doc): MenuEntry {
  const on = shared(doc);
  return {
    label: t(on ? 'macros.unshare' : 'macros.share'),
    icon: on ? LockIcon : UsersIcon,
    title: t(on ? 'macros.sharedHint' : 'macros.shareHint'),
    run: () => session.journal.patchEntry('macros', doc.id, { ownership: on ? null : { default: 'observer' } }),
  };
}

function macroMenu(session: Session, doc: Doc, run: () => void, edit: () => void): MenuEntry[] {
  const mine = session.journal.canEditMacro(doc.id);
  const out: MenuEntry[] = [{ label: t('macros.run'), icon: PlayIcon, run }];
  if (mine) out.push({ label: t('macros.edit'), icon: PencilIcon, run: edit });
  if (session.isGm() && !isScriptMacro(doc)) out.push(shareCommand(session, doc));
  if (mine) {
    out.push('separator', {
      label: t('macros.delete'),
      icon: Trash2Icon,
      danger: true,
      run: () => session.journal.deleteMacro(doc.id),
    });
  }
  return out;
}

function macroItem(session: Session, doc: Doc, edit: (id: string) => void): DirItem {
  const script = isScriptMacro(doc);
  const mine = session.journal.canEditMacro(doc.id);
  const run = () => void session.journal.runMacro(doc.id, session.selected);
  const whose: Record<string, string> = session.isGm() ? {} : { whose: mine ? 'mine' : 'shared' };
  return {
    key: doc.id,
    ref: { coll: 'macros', id: doc.id },
    name: nameOf(doc),
    folder: typeof doc.folder === 'string' ? doc.folder : undefined,
    tags: { kind: script ? 'script' : 'chat', ...whose },
    search: textOf(doc, 'command'),
    look: {
      picture: macroPicture(doc),
      sub: textOf(doc, 'command').split('\n')[0],
      badge: script && <Badge title={t('macros.scriptHint')}>{t('macros.script')}</Badge>,
    },
    open: mine ? () => edit(doc.id) : run,
    openTwice: mine ? run : undefined,
    drag: (e) => e.dataTransfer.setData(TILE_DRAG, JSON.stringify({ ref: `macro:${doc.id}` })),
    title: t(mine ? 'macros.clickHint' : 'macros.dragHint'),
    menu: macroMenu(session, doc, run, () => edit(doc.id)),
  };
}

/**
 * Chat macros, as in Foundry: each line of one is posted to chat as if typed
 * ("/r 1d20+5", or plain words). Run one from its menu, or drag it onto the
 * hotbar. The GM's macros are theirs until shared; players make their own.
 */
export function MacrosTab({ session }: Readonly<{ session: Session }>) {
  const [editing, setEditing] = useState<string>();
  const gm = session.isGm();
  const items = session.docs.all('macros').map((doc) => macroItem(session, doc, setEditing));
  const canMake = gm || session.you?.role !== 'observer';
  const open = editing ? session.docs.get('macros', editing) : undefined;
  return (
    <>
      <Directory
        session={session}
        id="macros"
        items={items}
        folders={{ kind: 'macros', editable: gm }}
        what={t('macros.what')}
        filters={[
          {
            key: 'kind',
            label: t('macros.kind'),
            options: [
              { value: 'chat', label: t('macros.kind.chat') },
              { value: 'script', label: t('macros.kind.script') },
            ],
          },
          ...(gm
            ? []
            : [
                {
                  key: 'whose',
                  label: t('macros.whose'),
                  options: [
                    { value: 'mine', label: t('macros.whose.mine') },
                    { value: 'shared', label: t('macros.whose.shared') },
                  ],
                },
              ]),
        ]}
        actions={
          canMake && (
            <Button variant="outline" size="sm" onClick={() => session.journal.createEntry('macro')}>
              <PlusIcon />
              {t('macros.new')}
            </Button>
          )
        }
        empty={t('macros.none')}
      />
      <Dialog open={!!open} onOpenChange={(on) => !on && setEditing(undefined)}>
        {open && session.journal.canEditMacro(open.id) && (
          <DialogContent>
            <DialogTitle>{nameOf(open)}</DialogTitle>
            <MacroEditor key={open.id} session={session} doc={open} onDeleted={() => setEditing(undefined)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

const PLACEHOLDER = {
  chat: 'Well met, friends!\n/r 1d20+5 persuasion',
  script: 'for (const t of vtt.tokens()) vtt.chat(`${t.name} is here`);',
};

function MacroEditor({ session, doc, onDeleted }: Readonly<{ session: Session; doc: Doc; onDeleted: () => void }>) {
  const [name, setName] = useState(nameOf(doc));
  const [command, setCommand] = useState(textOf(doc, 'command'));
  const [img, setImg] = useState(textOf(doc, 'img'));
  const kind = isScriptMacro(doc) ? 'script' : 'chat';
  const patch = (p: Record<string, unknown>) => session.journal.patchEntry('macros', doc.id, p);
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          session.journal.deleteMacro(doc.id);
          onDeleted();
        }}
      >
        {t('macros.delete')}
      </Button>
    </div>
  );
}
