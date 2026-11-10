import { type FeatureSheet, pickOptions, type Spell } from '@vtt/system-dnd5e';
import { BookOpenIcon } from 'lucide-react';
import { gameContent } from '../../content/content.ts';
import { t } from '../../i18n/index.ts';
import { setStat } from '../../play/token-edit.ts';
import { ORDINAL } from '../../text/spell-text.ts';
import { Button } from '../kit/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../kit/popover.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../kit/select.tsx';
import { canAct, type SheetProps } from './sheet-props.ts';

// A feature's spell picks on its sheet row (Feature `spellPicks`): the
// spells chosen for Mystic Arcanum, Spell Mastery or Signature Spells, one
// select per choice the class level opens; or, for a feature that picks as
// it casts (Divine Intervention), the spells it may cast now.

type Props = Readonly<SheetProps & { feature: FeatureSheet }>;

/** The spells each choice may be: the class's list, or those the character knows. */
function options({ sheet, feature }: Props): Spell[][] {
  const picks = feature.spellPicks!;
  const all = [...gameContent(sheet.edition).spells.values()];
  const from = picks.from === 'known' ? (sheet.caster?.spells ?? []) : all;
  return pickOptions(picks, feature.classLevel ?? 1, from).map((list) =>
    list.toSorted((a, b) => a.name.localeCompare(b.name)),
  );
}

export function SpellPicksButton(props: Props) {
  const { feature } = props;
  if (!feature.spellPicks) return null;
  const label = t(feature.spellPicks.atCast ? 'sheet.picks.cast' : 'sheet.picks.choose', { name: feature.name });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} title={label}>
          <BookOpenIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[280px] flex-col gap-2" data-slot="spell-picks">
        <span className="font-display text-sm text-gold">{feature.name}</span>
        {feature.spellPicks.atCast ? <CastList {...props} /> : <Choices {...props} />}
      </PopoverContent>
    </Popover>
  );
}

/** One select per open choice; picking stores the spell on the sheet. */
function Choices(props: Props) {
  const { feature, update, value } = props;
  const picked = value.stats?.spellPicks?.[feature.id] ?? [];
  const choose = (i: number, id: string) =>
    update((d) => {
      const next = [...(d.stats?.spellPicks?.[feature.id] ?? [])];
      next[i] = id;
      return setStat(d, 'spellPicks', { ...d.stats?.spellPicks, [feature.id]: next.filter(Boolean) });
    }, true);
  return (
    <>
      {options(props).map((list, i) => (
        <Select key={i} value={picked[i] ?? ''} onValueChange={(id) => id && choose(i, id)}>
          <SelectTrigger className="h-7 text-sm" aria-label={t('sheet.picks.choice', { n: i + 1 })}>
            <SelectValue placeholder={t('sheet.picks.none')} />
          </SelectTrigger>
          <SelectContent>
            {list.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {`${s.name} (${ORDINAL[s.level]})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      <p className="text-xs text-muted-foreground">{t('sheet.picks.hint')}</p>
    </>
  );
}

/** The spells the feature may cast now, each aimed at once with the feature paying. */
function CastList(props: Props) {
  const { feature, session, value } = props;
  const spells = options(props).flat();
  const cast = (spell: Spell) => {
    session.select(value.id);
    session.actions.aim(spell.id, spell.level, { paidBy: feature.id, spell });
  };
  const ready = canAct(props) && feature.left !== 0;
  return (
    <>
      <Select value="" disabled={!ready} onValueChange={(id) => cast(spells.find((s) => s.id === id)!)}>
        <SelectTrigger className="h-7 text-sm" aria-label={t('sheet.picks.castLabel')}>
          <SelectValue placeholder={t('sheet.picks.castLabel')} />
        </SelectTrigger>
        <SelectContent>
          {spells.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {`${s.name} (${ORDINAL[s.level]})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('sheet.picks.castHint')}</p>
    </>
  );
}
