import type * as React from 'react';
import { cn } from '@/lib/utils';

/** A colour swatch that opens the system colour picker. */
function ColorInput({ className, ...props }: Readonly<Omit<React.ComponentProps<'input'>, 'type'>>) {
  return (
    <input
      type="color"
      data-slot="color-input"
      className={cn(
        'h-8 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-black/35 p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] outline-none hover:border-gold-dim focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring/25 [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0',
        className,
      )}
      {...props}
    />
  );
}

export { ColorInput };
