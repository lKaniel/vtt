import type { Doc, DocRef } from '@vtt/core';
import type { FolderKind } from '@vtt/shared';
import { FolderPlusIcon } from 'lucide-react';
import { useState } from 'react';
import type * as React from 'react';
import { t } from '../../i18n/index.ts';
import { readListPref, readPref, writeListPref, writePref } from '../../prefs.ts';
import type { Session } from '../../session/session.ts';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import { SelectField } from '../kit/select.tsx';
import { type DirEntry, directoryTree, filterCounts, narrowed } from './directory-tree.ts';
import { carriesMove, moveOf } from './drag.ts';
import { Entries } from './DirectoryEntries.tsx';
import { FolderSection } from './DirectoryFolders.tsx';
import type { MenuEntry } from './menu.tsx';
import { type EntryLook, FilterToggle, SearchField, type ViewMode, ViewModes, VIEW_MODES } from './parts.tsx';

// A sidebar list (Actors, Scenes, Journal, Tables, Macros, Music, Cards):
// entries as a picture and a name, searched, filtered and shown as rows,
// compact lines or a grid of pictures, in Foundry-style folders the GM
// makes, colours, nests and drags things into. Everything an entry or a
// folder can do is on its right-click menu.

/** One thing in the list. */
export interface DirItem extends DirEntry {
  /** The document, when it can go in a folder. */
  ref?: DocRef;
  look: Omit<EntryLook, 'name'>;
  /** A click. */
  open?: () => void;
  /** A double click. */
  openTwice?: () => void;
  /** What a drag out of the list carries (onto the map, a sheet, the hotbar). */
  drag?: (e: React.DragEvent) => void;
  menu: MenuEntry[];
  title?: string;
}

/** A filter: a select over one of the entries' tags. */
export interface FilterDef {
  key: string;
  label: string;
  options: readonly { value: string; label: string }[];
}

export interface DirectoryProps {
  session: Session;
  /** Names the list's options kept in this browser (view, closed folders). */
  id: string;
  items: readonly DirItem[];
  /** Its folders: the list they are of, and whether you may change them (the GM). */
  folders?: { kind: FolderKind; editable: boolean };
  /** What the search field says it searches ("actors"). */
  what: string;
  filters?: readonly FilterDef[];
  /** Buttons beside the search: New actor... */
  actions?: React.ReactNode;
  /** Options under the toolbar. */
  options?: React.ReactNode;
  empty: string;
  hint?: string;
}

/** What the list is showing; kept per list. */
function useListState(id: string) {
  const [query, setQuery] = useState('');
  const [picks, setPicks] = useState<Record<string, string | undefined>>({});
  const [view, setView] = useState<ViewMode>(() => readPref(`${id}-view`, VIEW_MODES, 'list'));
  const [filters, setFilters] = useState(() => readPref(`${id}-filters`, ['shown', 'hidden'], 'hidden') === 'shown');
  const [closed, setClosed] = useState(() => new Set(readListPref(`${id}-closed`)));
  const [renaming, setRenaming] = useState<string>();
  return {
    query,
    setQuery,
    picks,
    pick: (key: string, value: string) => setPicks({ ...picks, [key]: value || undefined }),
    clear: () => setPicks({}),
    view,
    setView: (v: ViewMode) => {
      setView(v);
      writePref(`${id}-view`, v);
    },
    filters,
    showFilters: (on: boolean) => {
      setFilters(on);
      writePref(`${id}-filters`, on ? 'shown' : 'hidden');
    },
    closed,
    toggle: (folder: string) => {
      const next = new Set(closed);
      if (!next.delete(folder)) next.add(folder);
      setClosed(next);
      writeListPref(`${id}-closed`, [...next]);
    },
    expand: (folder: string) => {
      const next = new Set(closed);
      if (!next.delete(folder)) return;
      setClosed(next);
      writeListPref(`${id}-closed`, [...next]);
    },
    renaming,
    setRenaming,
  };
}

export type ListState = ReturnType<typeof useListState>;

export function Directory(props: Readonly<DirectoryProps>) {
  const s = useListState(props.id);
  const { session, folders, items } = props;
  const folderDocs = folders ? session.folders.of(folders.kind) : [];
  const tree = directoryTree(folderDocs, items, { query: s.query, picks: s.picks, keepEmpty: !!folders?.editable });
  const shown = narrowed({ query: s.query, picks: s.picks });
  const ctx = { session, props, s, open: (id: string) => shown || !s.closed.has(id), folderDocs };
  const empty = !tree.folders.length && !tree.entries.length;
  return (
    <div className="lib flex min-h-0 flex-col gap-1.5">
      <Toolbar props={props} s={s} />
      {s.filters && props.filters && <Filters filters={props.filters} items={items} s={s} />}
      {props.options}
      <RootDrop ctx={ctx}>
        {tree.folders.map((node) => (
          <FolderSection key={node.folder.id} node={node} ctx={ctx} depth={0} />
        ))}
        <Entries items={tree.entries} ctx={ctx} />
        {empty && <p className="muted lib-hint">{items.length ? t('list.none') : props.empty}</p>}
      </RootDrop>
      <div className="flex items-center justify-between gap-2">
        {props.hint ? <p className="muted lib-hint">{props.hint}</p> : <span />}
        {shown && <Badge variant="muted">{t('list.count', { n: countOf(tree) })}</Badge>}
      </div>
    </div>
  );
}

const countOf = (tree: ReturnType<typeof directoryTree>) =>
  tree.entries.length + tree.folders.reduce((n, f) => n + f.count, 0);

/** What the parts of a list share. */
export interface ListContext {
  session: Session;
  props: Readonly<DirectoryProps>;
  s: ListState;
  /** Whether a folder shows what is in it. */
  open: (id: string) => boolean;
  folderDocs: readonly Doc[];
}

function Toolbar({ props, s }: Readonly<{ props: Readonly<DirectoryProps>; s: ListState }>) {
  const picked = Object.values(s.picks).filter(Boolean).length;
  const { folders, session } = props;
  const newFolder = () => folders && s.setRenaming(session.folders.create(folders.kind, t('list.folder.new')));
  return (
    <>
      <div className="flex items-center gap-1.5">
        <SearchField value={s.query} onChange={s.setQuery} label={t('list.search', { what: props.what })} />
        {props.actions}
      </div>
      <div className="flex items-center gap-1.5">
        {folders?.editable && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={newFolder}
            title={t('list.newFolder')}
            aria-label={t('list.newFolder')}
          >
            <FolderPlusIcon />
          </Button>
        )}
        <span className="ml-auto" />
        {props.filters && <FilterToggle pressed={s.filters} onPressedChange={s.showFilters} picked={picked} />}
        <ViewModes value={s.view} onChange={s.setView} />
      </div>
    </>
  );
}

function Filters({
  filters,
  items,
  s,
}: Readonly<{ filters: readonly FilterDef[]; items: readonly DirItem[]; s: ListState }>) {
  const any = Object.values(s.picks).some(Boolean);
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t('list.filters')}>
      {filters.map((f) => {
        const counts = filterCounts(items, f.key);
        return (
          <SelectField
            key={f.key}
            value={s.picks[f.key] ?? ''}
            onValueChange={(v) => s.pick(f.key, v)}
            aria-label={f.label}
            placeholder={t('list.any', { what: f.label.toLowerCase() })}
            options={[
              { value: '', label: t('list.any', { what: f.label.toLowerCase() }) },
              ...f.options.map((o) => ({ ...o, hint: counts.get(o.value) ?? 0 })),
            ]}
          />
        );
      })}
      {any && (
        <Button variant="ghost" size="sm" onClick={s.clear}>
          {t('list.clear')}
        </Button>
      )}
    </div>
  );
}

/** The scrolling list; dropping something on it (not on a folder) takes it out of its folder. */
function RootDrop({ ctx, children }: Readonly<{ ctx: ListContext; children: React.ReactNode }>) {
  const { folders } = ctx.props;
  const editable = !!folders?.editable;
  return (
    <div
      className="lib-scroll"
      onDragOver={(e) => {
        if (editable && carriesMove(e)) e.preventDefault();
      }}
      onDrop={(e) => {
        const refs = folders && moveOf(e, folders.kind);
        if (!refs) return;
        e.preventDefault();
        ctx.session.folders.move(refs, undefined);
      }}
    >
      {children}
    </div>
  );
}
