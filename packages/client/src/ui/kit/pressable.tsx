import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A card, row or portrait you can press: it brings its own look, the kit
 * gives it the button behaviour (never submits a form, pointer, focus ring).
 * It stays a `pressable` slot inside a trigger (a popover's `asChild`), or the
 * base layer's button reset would wipe the look it brings.
 */
function Pressable({ className, type = 'button', ...props }: Readonly<React.ComponentProps<'button'>>) {
  return (
    <button
      type={type}
      className={cn(
        'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default',
        className,
      )}
      {...props}
      data-slot="pressable"
    />
  );
}

export { Pressable };
