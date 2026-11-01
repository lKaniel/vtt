import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-display tracking-wide transition-[color,background-color,border-color,box-shadow] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Polished bronze: the main thing to do. */
        default:
          'border border-gold-bright/40 bg-linear-to-b from-[#c4a573] to-[#8a6f48] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,240,210,0.35),0_2px_6px_rgba(0,0,0,0.5)] hover:from-[#d6b886] hover:to-[#9a7d53]',
        /** Dark iron with a bronze edge. */
        outline:
          'border border-gold-dim bg-linear-to-b from-[#2b2823] to-[#191714] text-gold-bright shadow-[inset_0_1px_0_rgba(232,211,166,0.08)] hover:border-gold hover:text-[#fff3d6]',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'border border-destructive/60 bg-destructive/80 text-white hover:bg-destructive',
        link: 'text-gold-bright underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 text-sm',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-10 px-5 text-base',
        icon: 'size-8',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
