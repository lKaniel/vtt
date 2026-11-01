import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-display tracking-wide transition-[color,background-color,border-color,box-shadow] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** The painted plate, lit: the main thing to do. */
        default:
          'art-button art-button-lit text-gold-bright [text-shadow:0_1px_2px_#000] hover:brightness-125 active:art-button-pressed disabled:art-button-off disabled:text-[#2a2a2a] disabled:[text-shadow:none] disabled:opacity-100',
        /** The painted plate. */
        outline:
          'art-button text-gold-bright [text-shadow:0_1px_2px_#000] hover:art-button-lit active:art-button-pressed disabled:art-button-off disabled:text-[#2a2a2a] disabled:[text-shadow:none] disabled:opacity-100',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'border border-destructive/60 bg-destructive/80 text-white hover:bg-destructive',
        link: 'text-gold-bright underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 text-sm',
        sm: 'h-8 px-3 text-xs',
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
