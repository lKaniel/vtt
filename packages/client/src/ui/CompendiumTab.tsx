import { type Edition, toEdition } from '@vtt/system-dnd5e';
import { FilterIcon, LayoutGridIcon, ListIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES, type Category, compendium, type Entry, type Facet, type Search } from '../compendium.ts';
import { type MessageKey, t } from '../i18n/index.ts';
import { readPref, writePref } from '../prefs.ts';
import type { Session } from '../session.ts';
import { CompendiumFilters } from './compendium/CompendiumFilters.tsx';
import { ResultGrid, ResultRows } from './compendium/CompendiumResults.tsx';
import { EntryDetail } from './compendium/EntryDetail.tsx';
import { HomebrewPanel } from './HomebrewPanel.tsx';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';
import { Toggle } from './kit/toggle.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The Compendium tab (the GM's, and trusted players' for their own sheets):
// the SRD books and the game's packs and homebrew, searched by name or by
// anything they are filed under, narrowed by filters, shown as rows or as a
// grid of pictures. Drag a monster onto the map to place it; an item, spell
// or feature onto a creature or a character sheet to give it.

const HINT: Record<Category, MessageKey> = {
  all: 'compendium.hint.all',
  monsters: 'compendium.hint.monsters',
  weapons: 'compendium.hint.items',
  armor: 'compendium.hint.items',
  gear: 'compendium.hint.items',
  spells: 'compendium.hint.spells',
  features: 'compendium.hint.features',
};
const VIEWS = ['list', 'grid'] as const;
type View = (typeof VIEWS)[number];
/** Entries shown at first and added per "Show more". */
const PAGE = 120;
const BOOKLESS: readonly Category[] = ['weapons', 'armor', 'gear'];

/** What the tab is showing: category, words, filters, order, view and which entry is open. */
function useCompendium(session: Session) {
  const [category, setCategory] = useState<Category>(() => readPref('compendium-category', CATEGORIES, 'monsters'));
  const [view, setView] = useState<View>(() => readPref('compendium-view', VIEWS, 'list'));
  const [rules, setRules] = useState<Edition>(toEdition(session.world?.rules));
  const [search, setSearch] = useState<Required<Search>>({ query: '', picks: {}, sort: 'name' });
  const [open, setOpen] = useState<string>();
  const [shown, setShown] = useState(PAGE);
  const [homebrew, setHomebrew] = useState(false);
  const [filters, setFilters] = useState(
    () => readPref('compendium-filters', ['shown', 'hidden'], 'shown') === 'shown',
  );
  /** A new search starts again from the top, nothing open. */
  const narrow = (next: Partial<Search>) => {
    setSearch({ ...search, ...next });
    setShown(PAGE);
    setOpen(undefined);
  };
  return {
    category,
    view,
    rules,
    search,
    open,
    shown,
    homebrew,
    filters,
    list: compendium(category, rules, search),
    toggleFilters: (on: boolean) => {
      setFilters(on);
      writePref('compendium-filters', on ? 'shown' : 'hidden');
    },
    setOpen,
    setHomebrew,
    narrow,
    more: () => setShown(shown + PAGE),
    pickCategory: (c: Category) => {
      setCategory(c);
      writePref('compendium-category', c);
      setHomebrew(false);
      setSearch({ ...search, picks: {}, sort: 'name' });
      setShown(PAGE);
      setOpen(undefined);
    },
    pickView: (v: string) => {
      if (!v) return;
      setView(v as View);
      writePref('compendium-view', v);
    },
    pickRules: (r: string) => {
      setRules(r as Edition);
      narrow({});
    },
  };
}

type State = ReturnType<typeof useCompendium>;

export function CompendiumTab({ session }: Readonly<{ session: Session }>) {
  const s = useCompendium(session);
  return (
    <div className="lib flex min-h-0 flex-col gap-2">
      <CategoryBar
        session={session}
        category={s.homebrew ? undefined : s.category}
        onCategory={s.pickCategory}
        homebrew={s.homebrew}
        onHomebrew={s.setHomebrew}
      />
      {s.homebrew ? <HomebrewPanel session={session} /> : <Browser session={session} s={s} />}
    </div>
  );
}

function Browser({ session, s }: Readonly<{ session: Session; s: State }>) {
  const { category, list, shown } = s;
  return (
    <>
      <Toolbar s={s} />
      {s.filters && (
        <CompendiumFilters
          category={category}
          rules={s.rules}
          picks={s.search.picks}
          onPick={(facet: Facet, value: string) =>
            s.narrow({ picks: { ...s.search.picks, [facet]: value || undefined } })
          }
          sort={s.search.sort}
          onSort={(sort) => s.narrow({ sort })}
          onClear={() => s.narrow({ picks: {} })}
        />
      )}
      <Results
        key={category}
        session={session}
        list={list}
        view={s.view}
        open={s.open}
        onOpen={s.setOpen}
        shown={shown}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="muted lib-hint">{t(HINT[category])}</p>
        <Badge variant="muted">{t('compendium.found', { n: list.length })}</Badge>
      </div>
      {list.length > shown && (
        <Button variant="outline" size="sm" onClick={s.more}>
          {t('compendium.more', { n: Math.min(PAGE, list.length - shown) })}
        </Button>
      )}
    </>
  );
}

function Toolbar({ s }: Readonly<{ s: State }>) {
  const picked = Object.values(s.search.picks).filter(Boolean).length;
  return (
    <div className="flex items-center gap-1.5">
      <SearchBox category={s.category} query={s.search.query} onQuery={(query) => s.narrow({ query })} />
      {!BOOKLESS.includes(s.category) && (
        <SelectField
          className="w-20 flex-none"
          value={s.rules}
          onValueChange={s.pickRules}
          aria-label={t('compendium.rules')}
          options={[
            { value: '2014', label: '2014' },
            { value: '2024', label: '2024' },
          ]}
        />
      )}
      <Toggle
        variant="plate"
        pressed={s.filters}
        onPressedChange={s.toggleFilters}
        aria-label={t('compendium.filters')}
        title={t('compendium.filters')}
      >
        <FilterIcon />
        {picked > 0 && picked}
      </Toggle>
      <ToggleGroup type="single" value={s.view} onValueChange={s.pickView} aria-label={t('compendium.view')}>
        <ToggleGroupItem value="list" aria-label={t('compendium.view.list')} title={t('compendium.view.list')}>
          <ListIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="grid" aria-label={t('compendium.view.grid')} title={t('compendium.view.grid')}>
          <LayoutGridIcon />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

function CategoryBar({
  session,
  category,
  onCategory,
  homebrew,
  onHomebrew,
}: Readonly<{
  session: Session;
  category: Category | undefined;
  onCategory: (c: Category) => void;
  homebrew: boolean;
  onHomebrew: (on: boolean) => void;
}>) {
  return (
    <nav className="lib-cats" aria-label={t('panel.Compendium')}>
      {CATEGORIES.map((c) => (
        <Toggle key={c} pressed={c === category} onPressedChange={() => onCategory(c)}>
          {t(`compendium.cat.${c}`)}
        </Toggle>
      ))}
      {session.isGm() && (
        <Toggle pressed={homebrew} onPressedChange={onHomebrew} title={t('compendium.homebrewHint')}>
          {t('compendium.homebrew')}
        </Toggle>
      )}
    </nav>
  );
}

function SearchBox({
  category,
  query,
  onQuery,
}: Readonly<{ category: Category; query: string; onQuery: (q: string) => void }>) {
  const label =
    category === 'all'
      ? t('compendium.searchAll')
      : t('compendium.search', { what: t(`compendium.cat.${category}`).toLowerCase() });
  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="lib-search pl-7"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </div>
  );
}

function Results({
  session,
  list,
  view,
  open,
  onOpen,
  shown,
}: Readonly<{
  session: Session;
  list: readonly Entry[];
  view: View;
  open: string | undefined;
  onOpen: (key: string | undefined) => void;
  shown: number;
}>) {
  const page = list.slice(0, shown);
  const opened = view === 'grid' ? list.find((e) => e.key === open) : undefined;
  return (
    <>
      <div className="lib-scroll">
        {view === 'grid' ? (
          <ResultGrid list={page} open={open} onOpen={onOpen} />
        ) : (
          <ResultRows session={session} list={page} open={open} onOpen={onOpen} />
        )}
        {list.length === 0 && <p className="muted lib-hint">{t('compendium.none')}</p>}
      </div>
      {opened && (
        <div className="max-h-[40%] flex-none overflow-y-auto border-t border-gold-dim/40 pt-1">
          <div className="px-1 font-display text-sm text-gold-bright">{opened.name}</div>
          <div className="lib-sub px-1">{opened.sub}</div>
          <EntryDetail session={session} entry={opened} />
        </div>
      )}
    </>
  );
}
