import type * as React from 'react';
import { cn } from '@/lib/utils';

/** A leather inset inside a panel, for grouping (the inventory slot art). */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('art-well', className)} {...props} />;
}

/** The heading of a panel or card: the display face in bright gold. */
function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('m-0 font-display text-[22px] font-normal text-gold-bright', className)}
      {...props}
    />
  );
}

export { Card, CardTitle };
