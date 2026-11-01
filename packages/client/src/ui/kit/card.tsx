import type * as React from 'react';
import { cn } from '@/lib/utils';

/** A leather inset inside a panel, for grouping (the inventory slot art). */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('art-well', className)} {...props} />;
}

export { Card };
