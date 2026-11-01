import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Buttons joined in a row, one (or several) pressed and lit with the painted plate: modes, speeds. */
function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        'inline-flex w-fit items-stretch overflow-hidden rounded-md border border-gold-dim bg-black/30 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]',
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 border-l border-gold-dim/60 px-2.5 py-1 font-display text-xs tracking-wide whitespace-nowrap text-muted-foreground transition-colors first:border-l-0 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-45 data-[state=on]:art-button data-[state=on]:art-button-lit data-[state=on]:text-gold-bright data-[state=on]:[text-shadow:0_1px_2px_#000] [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
