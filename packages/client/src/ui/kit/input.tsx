import type * as React from 'react';
import { cn } from '@/lib/utils';

/** The look every text field shares: a dark inset well with a bronze edge. */
export const fieldClass =
  'h-8 w-full min-w-0 rounded-md border border-input font-body bg-black/35 px-2.5 text-sm text-foreground shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-gold-dim focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldClass, className)} {...props} />;
}

export { Input };
