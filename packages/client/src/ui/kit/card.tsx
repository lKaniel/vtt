import type * as React from 'react';
import { cn } from '@/lib/utils';

/** A sunken box inside a panel, for grouping. */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-md border border-border bg-black/25 shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)]', className)}
      {...props}
    />
  );
}

export { Card };
