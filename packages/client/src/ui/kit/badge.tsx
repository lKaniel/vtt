import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[11px] tracking-wider whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-gold-dim bg-black/30 text-gold-bright',
        good: 'border-[#6fa86a]/50 bg-[#6fa86a]/15 text-[#a9d6a4]',
        warn: 'border-[#c98f3a]/50 bg-[#c98f3a]/15 text-[#e7b670]',
        muted: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
