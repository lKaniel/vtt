import { cn } from '@/lib/utils';
import { pipLeft, type ResourceKey, withResourceLeft } from '../../play/charges.ts';
import type { SheetProps } from './sheet-props.ts';
import { Button } from '../kit/button.tsx';
import { NumberField } from '../kit/number-field.tsx';

// One way to show and set everything a creature spends and gets back: spell
// slots, feature uses, legendary actions, a class's point pool, hit dice and
// an item's charges. Small ones are pips, big ones a number; in edit mode a
// click on a pip or a typed number sets what is left, for every kind alike.

/** A resource on the sheet: `left` of `total`, and where setting it writes. */
interface Resource {
  key: ResourceKey;
  name: string;
  left: number;
  total: number;
  /** Spell slots are blue pips, everything else gold. */
  tone?: 'slot' | 'gold';
}

const MAX_PIPS = 10;

const shown = (n: number) => Math.round(n * 100) / 100;

type MeterProps = Readonly<Pick<SheetProps, 'edit' | 'update'> & { resource: Resource; label?: boolean }>;

/** The resource, settable in edit mode; `label` shows its name before it. */
export function ResourceMeter({ resource, edit, update, label }: MeterProps) {
  const set = (left: number) => update((d) => withResourceLeft(d, resource.key, { left, total: resource.total }), true);
  return (
    <span
      className="charge-row"
      data-slot="resource"
      title={`${resource.name}: ${shown(resource.left)}/${shown(resource.total)}`}
    >
      {label && <span className="charge-row-name">{resource.name}</span>}
      <Pips resource={resource} onChange={edit ? set : undefined} />
    </span>
  );
}

interface PipProps {
  resource: Resource;
  onChange: ((left: number) => void) | undefined;
}

/** Pips, or a number for big pools; given `onChange`, they spend and restore. */
function Pips({ resource, onChange }: Readonly<PipProps>) {
  const { name, left, total, tone } = resource;
  if (total > MAX_PIPS || !Number.isInteger(left)) return <Count resource={resource} onChange={onChange} />;
  const cls = (k: number) => cn('pip', tone !== 'slot' && 'feature', k >= left && 'used');
  const pips = Array.from({ length: total }, (_, k) =>
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
  );
  return <>{pips}</>;
}

function Count({ resource, onChange }: Readonly<PipProps>) {
  const { name, left, total } = resource;
  if (!onChange)
    return (
      <span className="text-sm">
        {shown(left)}/{shown(total)}
      </span>
    );
  return (
    <>
      <NumberField
        className="w-24"
        aria-label={name}
        value={shown(left)}
        min={0}
        max={total}
        onValueChange={onChange}
      />
      <span className="text-sm text-muted-foreground">/{shown(total)}</span>
    </>
  );
}
