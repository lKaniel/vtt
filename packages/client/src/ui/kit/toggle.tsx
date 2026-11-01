import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const toggleVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 data-[state=on]:text-gold-bright data-[state=on]:[text-shadow:0_1px_2px_#000] [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        /** A pill, lit with the painted plate when on: filters, picks, categories. */
        chip: 'h-7 rounded-full border border-border bg-black/30 px-3 font-body text-sm text-muted-foreground hover:border-gold-dim hover:text-foreground data-[state=on]:rounded-none data-[state=on]:border-0 data-[state=on]:art-button data-[state=on]:art-button-lit',
        /** A painted button that stays down: sits in a row of Buttons. */
        plate:
          'art-button h-8 px-3 font-display text-xs tracking-wide text-gold-bright [text-shadow:0_1px_2px_#000] hover:art-button-lit data-[state=on]:art-button-pressed',
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
