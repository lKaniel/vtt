import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A card, row or portrait you can press: it brings its own look, the kit
 * gives it the button behaviour (never submits a form, pointer, focus ring).
 */
function Pressable({ className, type = 'button', ...props }: Readonly<React.ComponentProps<'button'>>) {
  return (
    <button
      data-slot="pressable"
      type={type}
      className={cn(
        'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default',
        className,
      )}
      {...props}
    />
  );
}

export { Pressable };
