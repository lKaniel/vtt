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
          'art-button art-button-lit text-gold-bright [text-shadow:0_1px_2px_#000] hover:brightness-125 active:art-button-pressed disabled:art-button disabled:text-muted-foreground',
        /** The quiet frame: a bronze hairline that lights up on hover. Most buttons. */
        outline:
          'art-hairline text-gold-bright/90 hover:border-gold hover:bg-gold/10 hover:text-gold-bright active:bg-black/40',
        /** The painted card plate: a big choice on a menu screen. */
        menu: 'art-card text-gold-bright [text-shadow:0_1px_3px_#000] hover:brightness-125',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        /** The quiet frame with a warning red label: deleting, leaving. */
        destructive:
          'art-hairline border-destructive/50 text-[#ffb3a8] hover:border-destructive hover:bg-destructive/15 hover:text-[#ffd0c8] active:bg-black/40',
        link: 'h-auto px-0 font-body text-muted-foreground underline underline-offset-2 hover:text-gold-bright',
        /** The painted round close button. */
        close:
          "size-8 bg-[url('/art/ui/close-button.webp')] bg-contain bg-center bg-no-repeat text-[0px] hover:brightness-125",
      },
      size: {
        default: 'h-8 px-3.5 text-sm',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-9 px-5 text-base',
        xl: 'h-11 px-6 text-lg',
        icon: 'size-7',
        'icon-sm': 'size-6',
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
