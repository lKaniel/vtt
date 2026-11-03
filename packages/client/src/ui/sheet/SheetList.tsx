import { type ReactNode, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '../../i18n/index.ts';
import { pipLeft } from '../../play/charges.ts';
import type { Icon } from '../../icons.ts';
import type { Tip } from '../../text/tooltip.ts';
import { NumberInput } from '../EditorFields.tsx';
import { IconFace } from '../Icon.tsx';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';

// The lists on the sheet's tabs, laid out like Foundry's: a section per kind
// with its column titles, one row per thing (its picture, name, columns and
// buttons), and a click on the name opening its description in place.

export interface Column {
  label: string;
  /** Its width (and alignment), the same in the title and in every row. */
  className: string;
}

/** The width of the buttons at the end of each row. */
const CONTROLS = 'w-[76px]';

interface SectionProps {
  title: ReactNode;
  /** Beside the title: slot pips, a container's load. */
  aside?: ReactNode;
  columns: readonly Column[];
  children: ReactNode;
  /** Drop handlers when things can be dragged into it. */
  drop?: Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDrop'>;
  label?: string;
}

export function ListSection({ title, aside, columns, children, drop, label }: Readonly<SectionProps>) {
  return (
    <section className="mb-4" aria-label={label} {...drop}>
      <header className="mb-0.5 flex items-center gap-2 border-b border-gold-dim/70 pb-1">
        <h4 className="m-0 flex flex-1 items-center gap-3 font-display text-sm tracking-wider text-gold">
          {title}
          {aside}
        </h4>
        {columns.map((c) => (
          <span key={c.label} className={cn('shrink-0 text-center text-xs text-muted-foreground', c.className)}>
            {c.label}
          </span>
        ))}
        <span className={cn('shrink-0', CONTROLS)} />
      </header>
      <ul className="m-0 list-none p-0">{children}</ul>
    </section>
  );
}

interface RowProps {
  icon: Icon;
  name: string;
  /** Small marks after the name: equipped, concentration, quantity. */
  tags?: ReactNode;
  columns: readonly Column[];
  cells: readonly ReactNode[];
  controls?: ReactNode;
  /** What opens under the row when its name is clicked. */
  tip?: Tip;
  onDragStart?: (e: React.DragEvent) => void;
  /** Dimmed: spent, or not equipped. */
  faded?: boolean;
}

export function ListRow({ icon, name, tags, columns, cells, controls, tip, onDragStart, faded }: Readonly<RowProps>) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className="border-b border-white/5 last:border-b-0"
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      aria-label={name}
    >
      <div className={cn('flex min-h-9 items-center gap-2 py-0.5', faded && 'opacity-60')}>
        <span
          className={cn(
            'size-7 shrink-0 overflow-hidden rounded-[3px] border border-gold-dim/60',
            onDragStart && 'cursor-grab',
          )}
          title={onDragStart && t('sheet.dragHint')}
        >
          <IconFace icon={icon} size={18} />
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 min-w-0 flex-1 justify-start gap-2 px-1 font-body text-sm text-foreground"
          aria-expanded={tip ? open : undefined}
          onClick={() => tip && setOpen(!open)}
        >
          <span className="truncate">{name}</span>
          {tags}
        </Button>
        {cells.map((cell, i) => (
          <span key={columns[i]?.label ?? i} className={cn('shrink-0 text-center text-sm', columns[i]?.className)}>
            {cell}
          </span>
        ))}
        <span className={cn('flex shrink-0 items-center justify-end gap-0.5', CONTROLS)}>{controls}</span>
      </div>
      {open && tip && <Summary tip={tip} />}
    </li>
  );
}

/** A row's description, opened in place. */
function Summary({ tip }: Readonly<{ tip: Tip }>) {
  return (
    <div className="mb-2 ml-9 rounded-sm border-l-2 border-gold-dim bg-black/25 px-3 py-2 text-sm">
      <div className="text-xs text-muted-foreground italic first-letter:uppercase">{tip.subtitle}</div>
      {tip.facts.length > 0 && (
        <div className="my-1 flex flex-wrap gap-1">
          {tip.facts.map((f) => (
            <Badge key={f} variant="muted">
              {f}
            </Badge>
          ))}
        </div>
      )}
      {tip.body && <p className="m-0 whitespace-pre-line text-foreground/85">{tip.body}</p>}
      {tip.warning && <p className="m-0 mt-1 text-xs text-destructive">{tip.warning}</p>}
    </div>
  );
}

/** The search box above a tab's lists. */
export function SheetSearch({ value, onChange }: Readonly<{ value: string; onChange: (q: string) => void }>) {
  return (
    <label className="relative mb-3 block">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="h-7 pl-7 text-sm"
        placeholder={t('sheet.search')}
        aria-label={t('sheet.search')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** A round button at the end of a row: use, equip, attune. */
export function RowButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: Readonly<{ label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: ReactNode }>) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(pressed && 'text-gold-bright')}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

const MAX_PIPS = 10;

interface PipProps {
  name: string;
  left: number;
  total: number;
  onChange?: (left: number) => void;
  /** A feature's uses (gold) rather than spell slots (blue). */
  feature?: boolean;
}

/** Charges left: pips, or a number for big pools; given `onChange`, they spend and restore. */
export function Pips(props: Readonly<PipProps>) {
  const { name, left, total, onChange, feature } = props;
  if (total > MAX_PIPS) return <PoolLeft {...props} />;
  const cls = (k: number) => cn('pip', feature && 'feature', k >= left && 'used');
  return (
    <span className="charge-row" title={`${name}: ${left}/${total}`}>
      {Array.from({ length: total }, (_, k) =>
        onChange ? (
          <Button
            key={k}
            variant="ghost"
            className={cn(cls(k), 'size-3 rounded-none p-0')}
            aria-label={`${name} ${k + 1}`}
            onClick={() => onChange(pipLeft(k, left))}
          />
        ) : (
          <span key={k} className={cls(k)} />
        ),
      )}
    </span>
  );
}

function PoolLeft({ name, left, total, onChange }: Readonly<PipProps>) {
  if (!onChange)
    return (
      <span className="text-sm">
        {left}/{total}
      </span>
    );
  return (
    <span className="charge-row">
      <NumberInput
        className="pool-left"
        value={left}
        min={0}
        onChange={(v) => onChange(Math.min(total, Math.max(0, v ?? total)))}
      />
      <span className="text-muted-foreground" aria-label={`${name} uses`}>
        /{total}
      </span>
    </span>
  );
}

/** A short line in place of an empty list. */
export function Empty({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="my-2 text-sm text-muted-foreground italic">{children}</p>;
}
