import type { Content, ProficiencyChoice } from '@vtt/system-dnd5e';
import { XIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import {
  addableProficiencies,
  groupProficiencies,
  type ProficiencyGroupKind,
  type ProficiencyItem,
} from '../../text/proficiency-text.ts';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../kit/select.tsx';
import { Toggle } from '../kit/toggle.tsx';

// Armor, weapons, tools and languages, shared by the creator, the level up
// and the sheet: a list by kind, a select to add one, and the picks a class,
// species or background offers.

type Book = Pick<Content, 'items' | 'edition'>;

const kindName = (kind: ProficiencyGroupKind) => t(`prof.kind.${kind}` as MessageKey);

interface ListProps {
  list: readonly string[];
  content: Book;
  /** Shown with an × to take it away. */
  onRemove?: (id: string) => void;
  /** Tools become buttons that roll a check with them. */
  onRoll?: (item: ProficiencyItem) => void;
}

function Item({ item, onRemove, onRoll }: Readonly<{ item: ProficiencyItem } & Omit<ListProps, 'list' | 'content'>>) {
  if (onRoll && item.ability) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2"
        title={t('prof.roll', { name: item.name })}
        onClick={() => onRoll(item)}
      >
        {item.name}
      </Button>
    );
  }
  return (
    <Badge variant="muted">
      {item.name}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-1 size-4"
          aria-label={t('prof.remove', { name: item.name })}
          onClick={() => onRemove(item.id)}
        >
          <XIcon />
        </Button>
      )}
    </Badge>
  );
}

/** Proficiencies by kind: "Armor: Light armor, Shields". */
export function ProficiencyList({ list, content, onRemove, onRoll }: Readonly<ListProps>) {
  return (
    <dl className="m-0 flex flex-col gap-1.5" data-slot="proficiency-list">
      {groupProficiencies(list, content).map((g) => (
        <div key={g.kind} className="flex flex-wrap items-center gap-1">
          <dt className="mr-1 w-20 shrink-0 font-display text-[11px] tracking-wider text-muted-foreground uppercase">
            {kindName(g.kind)}
          </dt>
          {g.items.map((item) => (
            <dd key={item.id} className="m-0">
              <Item item={item} onRemove={onRemove} onRoll={onRoll} />
            </dd>
          ))}
        </div>
      ))}
    </dl>
  );
}

/** A select of every proficiency not had yet, by kind; picking one adds it. */
export function ProficiencyAdder({
  have,
  content,
  onAdd,
  id,
}: Readonly<{ have: readonly string[]; content: Book; onAdd: (id: string) => void; id?: string }>) {
  return (
    <Select value="" onValueChange={(v) => v && onAdd(v)}>
      <SelectTrigger id={id} className="h-7 text-sm" aria-label={t('prof.add')}>
        <SelectValue placeholder={t('prof.add')} />
      </SelectTrigger>
      <SelectContent>
        {addableProficiencies(have, content).map((g) => (
          <SelectGroup key={g.kind}>
            <SelectLabel>{kindName(g.kind)}</SelectLabel>
            {g.items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One offered pick: "Choose 2 languages (Acolyte)" and a toggle for each option. */
export function ProficiencyPick({
  choice,
  content,
  onToggle,
}: Readonly<{ choice: ProficiencyChoice; content: Book; onToggle: (id: string) => void }>) {
  const label = choice.source
    ? t('prof.chooseFrom', { n: choice.pick, source: choice.source })
    : t('prof.choose', { n: choice.pick });
  return (
    <div
      className="flex flex-col gap-1"
      data-slot="proficiency-pick"
      data-pick={choice.pick}
      role="group"
      aria-label={label}
    >
      <p className="cc-label">
        {label}{' '}
        <span className="text-muted-foreground">
          {t('prof.picked', { picked: choice.picked.length, pick: choice.pick })}
        </span>
      </p>
      <div className="cc-chips">
        {groupProficiencies(choice.options, content)
          .flatMap((g) => g.items)
          .map((item) => (
            <Toggle key={item.id} pressed={choice.picked.includes(item.id)} onPressedChange={() => onToggle(item.id)}>
              {item.name}
            </Toggle>
          ))}
      </div>
    </div>
  );
}
