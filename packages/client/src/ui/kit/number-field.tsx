import { MinusIcon, PlusIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface NumberFieldProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Show at least this many digits (2 for "08" minutes). */
  pad?: number;
}

const clamp = (n: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

/** A number with − and + steppers either side, kept between `min` and `max`. */
function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  pad,
  className,
  ...props
}: Readonly<NumberFieldProps>) {
  const set = (n: number) => onValueChange(clamp(n, min, max));
  const shown = pad ? String(value).padStart(pad, '0') : String(value);
  return (
    <div
      data-slot="number-field"
      className={cn(
        'flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-black/35 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] focus-within:border-gold focus-within:ring-2 focus-within:ring-ring/25',
        className,
      )}
    >
      <Step label="Less" disabled={min !== undefined && value <= min} onClick={() => set(value - step)}>
        <MinusIcon />
      </Step>
      <input
        data-slot="number-field-input"
        inputMode="numeric"
        className="w-full min-w-0 bg-transparent text-center font-body text-sm lining-nums tabular-nums outline-none"
        value={shown}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) set(n);
        }}
        {...props}
      />
      <Step label="More" disabled={max !== undefined && value >= max} onClick={() => set(value + step)}>
        <PlusIcon />
      </Step>
    </div>
  );
}

function Step({ label, ...props }: React.ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      data-slot="number-field-step"
      aria-label={label}
      tabIndex={-1}
      className="flex w-6 shrink-0 cursor-pointer items-center justify-center text-gold hover:bg-white/5 hover:text-gold-bright disabled:cursor-default disabled:opacity-30 [&_svg]:size-3"
      {...props}
    />
  );
}

export { NumberField };
