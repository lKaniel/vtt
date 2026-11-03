import type { Edition } from '@vtt/system-dnd5e';
import {
  type Category,
  crText,
  type Facet,
  facetOptions,
  FACETS,
  type Picks,
  type Sort,
} from '../../content/compendium.ts';
import { t } from '../../i18n/index.ts';
import { Button } from '../kit/button.tsx';
import { SelectField } from '../kit/select.tsx';

// The Compendium's filters: one select per thing the category is filed
// under (level, school, CR, source pack...), each listing only the values
// its entries have, with how many; and the sort order.

/** How a filter value reads: challenge ratings and levels as words, the rest as filed. */
function valueLabel(facet: Facet, value: string): string {
  if (facet === 'cr') return t('compendium.cr', { cr: crText(Number(value)) });
  if (facet === 'level') return value === '0' ? t('compendium.cantrip') : t('compendium.level', { n: value });
  return value;
}

interface FiltersProps {
  category: Category;
  rules: Edition;
  picks: Picks;
  onPick: (facet: Facet, value: string) => void;
  sort: Sort;
  onSort: (sort: Sort) => void;
  onClear: () => void;
}

/** Categories whose entries have an order worth sorting by. */
const SORTABLE: Partial<Record<Category, 'compendium.sort.cr' | 'compendium.sort.order'>> = {
  monsters: 'compendium.sort.cr',
  spells: 'compendium.sort.order',
  features: 'compendium.sort.order',
};

export function CompendiumFilters({ category, rules, picks, onPick, sort, onSort, onClear }: Readonly<FiltersProps>) {
  const sortBy = SORTABLE[category];
  const any = Object.values(picks).some(Boolean);
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t('list.filters')}>
      {FACETS[category].map((facet) => (
        <FacetSelect
          key={facet}
          facet={facet}
          category={category}
          rules={rules}
          value={picks[facet] ?? ''}
          onPick={onPick}
        />
      ))}
      {sortBy && (
        <SelectField
          value={sort}
          onValueChange={(s) => onSort(s as Sort)}
          aria-label={t('compendium.sort')}
          options={[
            { value: 'name', label: t('compendium.sort.name') },
            { value: 'order', label: t(sortBy) },
          ]}
        />
      )}
      {any && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t('list.clear')}
        </Button>
      )}
    </div>
  );
}

function FacetSelect({
  facet,
  category,
  rules,
  value,
  onPick,
}: Readonly<{
  facet: Facet;
  category: Category;
  rules: Edition;
  value: string;
  onPick: (facet: Facet, value: string) => void;
}>) {
  const what = t(`compendium.facet.${facet}`);
  const options = facetOptions(category, rules, facet);
  return (
    <SelectField
      value={value}
      onValueChange={(v) => onPick(facet, v)}
      aria-label={what}
      className={value ? 'text-gold-bright' : undefined}
      options={[
        { value: '', label: t('compendium.any', { what }) },
        ...options.map((o) => ({ value: o.value, label: valueLabel(facet, o.value), hint: o.count })),
      ]}
    />
  );
}
