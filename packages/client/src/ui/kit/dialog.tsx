import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Dialog(props: Readonly<React.ComponentProps<typeof DialogPrimitive.Root>>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: Readonly<React.ComponentProps<typeof DialogPrimitive.Trigger>>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/** A window over a dimmed screen, on the painted panel frame, with a close button. */
function DialogContent({
  className,
  children,
  ...props
}: Readonly<React.ComponentProps<typeof DialogPrimitive.Content>>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-[1000] bg-black/55" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'art-panel fixed top-1/2 left-1/2 z-[1001] flex max-h-[calc(100vh-48px)] w-[min(460px,calc(100vw-32px))] -translate-1/2 flex-col gap-3 overflow-y-auto px-7 py-6 font-body text-popover-foreground shadow-[0_20px_60px_rgba(0,0,0,0.8)] outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 cursor-pointer text-gold hover:text-gold-bright [&_svg]:size-4"
        >
          <XIcon />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Title>>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('pr-6 font-display text-lg tracking-wide text-gold-bright', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: Readonly<React.ComponentProps<typeof DialogPrimitive.Description>>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger };
