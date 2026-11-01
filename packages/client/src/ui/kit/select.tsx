import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input.tsx';

function Select(props: Readonly<React.ComponentProps<typeof SelectPrimitive.Root>>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue(props: Readonly<React.ComponentProps<typeof SelectPrimitive.Value>>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  children,
  ...props
}: Readonly<React.ComponentProps<typeof SelectPrimitive.Trigger>>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        fieldClass,
        'flex max-w-full cursor-pointer items-center justify-between gap-2 overflow-hidden text-left data-placeholder:text-muted-foreground [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-3.5 text-gold" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: Readonly<React.ComponentProps<typeof SelectPrimitive.Content>>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          'relative z-[1000] max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border border-gold-dim bg-popover font-body text-popover-foreground shadow-[0_10px_30px_rgba(0,0,0,0.7)]',
          position === 'popper' && 'w-full min-w-(--radix-select-trigger-width) data-[side=bottom]:translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: Readonly<React.ComponentProps<typeof SelectPrimitive.Item>>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex w-full cursor-pointer items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4 text-gold-bright" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

/** Radix gives no item the empty value; this one stands in for it. */
const NONE = '\u0000none';

interface SelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  /** The choices; a value may be '' (none). */
  options: readonly { value: string; label: React.ReactNode; disabled?: boolean }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  title?: string;
  'aria-label'?: string;
}

/** A whole select in one: a trigger showing the choice and a list of options. */
function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ...trigger
}: Readonly<SelectFieldProps>) {
  // '' with no '' option shows the placeholder (a "Send…" picker that acts and resets).
  const none = options.some((o) => o.value === '');
  const wire = (v: string) => (v === '' && none ? NONE : v);
  return (
    <Select value={wire(value)} onValueChange={(v) => onValueChange(v === NONE ? '' : v)} disabled={trigger.disabled}>
      <SelectTrigger className={className} {...trigger}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={wire(o.value)} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { Select, SelectContent, SelectField, SelectItem, SelectTrigger, SelectValue };
