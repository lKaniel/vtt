import { Separator as SeparatorPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** A thin bronze rule that fades out at both ends; `ornate`: the painted divider with its gem. */
function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ornate = false,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & { ornate?: boolean }) {
  if (ornate) {
    return (
      <SeparatorPrimitive.Root
        data-slot="separator"
        decorative={decorative}
        className={cn('art-divider h-7 w-full shrink-0', className)}
        {...props}
      />
    );
  }
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 from-transparent via-gold-dim to-transparent data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=horizontal]:bg-linear-to-r data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px data-[orientation=vertical]:bg-linear-to-b',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
