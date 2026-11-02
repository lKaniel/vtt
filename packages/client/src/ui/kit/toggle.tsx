import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const toggleVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 data-[state=on]:text-gold-bright data-[state=on]:[text-shadow:0_1px_2px_#000] [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        /** A small square chip, lit with a bronze edge when on: filters, picks, categories, map modes. */
        chip: 'h-7 rounded-[3px] border border-transparent px-2 font-body text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground data-[state=on]:border-gold/60 data-[state=on]:bg-gold/12',
        /** A quiet framed button that stays down: sits in a row of Buttons. */
        plate:
          'art-hairline h-7 px-2.5 font-display text-xs tracking-wide text-gold-bright/90 hover:border-gold hover:bg-gold/10 data-[state=on]:border-gold data-[state=on]:bg-gold/15',
      },
    },
    defaultVariants: { variant: 'chip' },
  },
);

/** Something that is on or off. */
function Toggle({
  className,
  variant,
  ...props
}: Readonly<React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant }), className)} {...props} />;
}

export { Toggle };
