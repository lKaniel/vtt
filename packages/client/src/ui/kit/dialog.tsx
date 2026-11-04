import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { t } from '../../i18n/index.ts';
import { usePortalHost } from './portal-host.tsx';
import { useWindowFrame } from './use-window-frame.ts';
import { WindowButtons } from './window.tsx';

/** Says whether the dialog dims the table and holds the focus (modal) or floats over it like any window. */
const ModalContext = React.createContext(false);

/**
 * A dialog floats over the table like Foundry's windows (not modal, unless
 * asked): drag it by its title, roll it up to it, keep playing around it.
 */
function Dialog({ modal = false, ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Root>>) {
  return (
    <ModalContext value={modal}>
      <DialogPrimitive.Root data-slot="dialog" modal={modal} {...props} />
    </ModalContext>
  );
}

function DialogTrigger(props: Readonly<React.ComponentProps<typeof DialogPrimitive.Trigger>>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/** A press here moves the dialog: on its title, or its own frame round the content. */
const isHandle = (e: React.MouseEvent<HTMLElement>) =>
  e.target === e.currentTarget || (e.target as Element).closest('[data-slot="dialog-title"]');

/** A window on the painted panel frame, with roll up and close buttons; a click outside leaves it open. */
function DialogContent({
  className,
  children,
  onInteractOutside,
  ...props
}: Readonly<React.ComponentProps<typeof DialogPrimitive.Content>>) {
  const modal = React.use(ModalContext);
  const { ref, ...frame } = useWindowFrame({ id: `dialog-${React.useId()}` });
  return (
    <DialogPrimitive.Portal container={usePortalHost()}>
      {modal && <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-[99] bg-black/55" />}
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        data-collapsed={frame.collapsed || undefined}
        style={frame.style}
        onPointerDownCapture={frame.raise}
        onPointerDown={(e) => isHandle(e) && frame.handle.onPointerDown(e)}
        onDoubleClick={(e) => isHandle(e) && frame.toggle()}
        onInteractOutside={(e) => {
          onInteractOutside?.(e);
          e.preventDefault();
        }}
        className={cn(
          'art-panel fixed top-1/2 left-1/2 flex max-h-[calc(100vh-48px)] w-[min(460px,calc(100vw-32px))] -translate-1/2 flex-col gap-3 overflow-y-auto px-5 py-4 font-body text-popover-foreground shadow-[0_20px_60px_rgba(0,0,0,0.8)] outline-none',
          'data-[collapsed]:overflow-hidden data-[collapsed]:py-2 data-[collapsed]:[&>*:not([data-slot=dialog-title]):not([data-window-controls])]:hidden',
          className,
        )}
        {...props}
      >
        {children}
        <span data-window-controls="" className="absolute top-3 right-3 flex items-center gap-0.5">
          <WindowButtons collapsed={frame.collapsed} onToggle={frame.toggle} />
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={t('window.close')}
            title={t('window.close')}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-gold hover:bg-accent hover:text-gold-bright [&_svg]:size-4"
          >
            <XIcon />
          </DialogPrimitive.Close>
        </span>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: Readonly<React.ComponentProps<typeof DialogPrimitive.Title>>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'cursor-grab pr-14 font-display text-lg tracking-wide text-gold-bright select-none active:cursor-grabbing',
        className,
      )}
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
