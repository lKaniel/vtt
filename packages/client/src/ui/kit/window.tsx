import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { t } from '../../i18n/index.ts';
import { Button } from './button.tsx';
import { type FrameOptions, useWindowFrame } from './use-window-frame.ts';
import type { Place, Size } from './window-stack.ts';

/**
 * A floating window over the table, as in Foundry: a title bar to drag it
 * by (double-click rolls it up to the bar), the window's own buttons, roll
 * up and close; a corner to resize it from. The last one touched is on top.
 */
function Window({
  id,
  kind,
  initial,
  title,
  label,
  actions,
  onClose,
  closeLabel,
  resizable,
  role,
  className,
  bodyClassName,
  children,
  ...props
}: Readonly<
  Omit<React.ComponentProps<'section'>, 'title'> &
    FrameOptions & {
      initial: (view: Size) => Place;
      title: React.ReactNode;
      /** The window's name for screen readers, when the title isn't plain text. */
      label?: string;
      /** Buttons of the window's own, in the title bar before roll up and close. */
      actions?: React.ReactNode;
      onClose: () => void;
      closeLabel?: string;
      resizable?: boolean;
      bodyClassName?: string;
    }
>) {
  const { ref, ...frame } = useWindowFrame({ id, kind, initial });
  return (
    <section
      ref={ref}
      role={role}
      aria-label={labelOf(label, title)}
      data-slot="window"
      data-collapsed={collapsedAttr(frame.collapsed)}
      onPointerDownCapture={frame.raise}
      style={frame.style}
      className={cn(
        'art-panel fixed flex max-h-[calc(100vh-16px)] min-w-[220px] flex-col font-body text-popover-foreground shadow-[0_16px_48px_rgba(0,0,0,0.7)] outline-none data-[collapsed]:h-auto!',
        className,
      )}
      {...props}
    >
      <WindowHeader
        title={title}
        actions={actions}
        collapsed={frame.collapsed}
        onToggle={frame.toggle}
        onClose={onClose}
        closeLabel={closeLabel}
        handle={frame.handle}
      />
      <WindowBody
        className={bodyClassName}
        onResize={frame.startResize}
        resizable={resizable}
        collapsed={frame.collapsed}
      >
        {children}
      </WindowBody>
    </section>
  );
}

/** The name screen readers read: the label given, else a plain-text title. */
const labelOf = (label: string | undefined, title: React.ReactNode) =>
  label ?? (typeof title === 'string' ? title : undefined);
/** data-collapsed is there only while rolled up. */
const collapsedAttr = (collapsed: boolean) => (collapsed ? '' : undefined);

/** What the window holds, and the corner to resize it from (when it may be). */
function WindowBody({
  className,
  onResize,
  resizable,
  collapsed,
  children,
}: Readonly<{
  className?: string;
  onResize: (e: React.PointerEvent<HTMLElement>) => void;
  resizable?: boolean;
  collapsed: boolean;
  children: React.ReactNode;
}>) {
  if (collapsed) return null;
  return (
    <>
      <div data-slot="window-body" className={cn('flex min-h-0 flex-1 flex-col overflow-auto', className)}>
        {children}
      </div>
      {resizable && (
        <div
          data-slot="window-resize"
          aria-label={t('window.resize')}
          title={t('window.resize')}
          onPointerDown={onResize}
          className="absolute -right-1.5 -bottom-1.5 size-4 cursor-nwse-resize touch-none bg-[linear-gradient(135deg,transparent_50%,var(--ui-gold-dim)_50%,var(--ui-gold-dim)_60%,transparent_60%,transparent_70%,var(--ui-gold-dim)_70%,var(--ui-gold-dim)_80%,transparent_80%)]"
        />
      )}
    </>
  );
}

/** The title bar: drag to move, double-click to roll up; the window's buttons, roll up and close on the right. */
function WindowHeader({
  title,
  actions,
  collapsed,
  onToggle,
  onClose,
  closeLabel = t('window.close'),
  handle,
}: Readonly<{
  title: React.ReactNode;
  actions?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
  closeLabel?: string;
  handle: React.HTMLAttributes<HTMLElement>;
}>) {
  return (
    <header
      data-slot="window-header"
      className="flex h-8 shrink-0 cursor-grab touch-none items-center gap-1.5 border-b border-gold-dim/40 pr-1 pl-3 select-none active:cursor-grabbing"
      {...handle}
    >
      <span className="min-w-0 flex-1 truncate font-display text-sm tracking-wide text-gold-bright">{title}</span>
      {actions}
      <WindowButtons collapsed={collapsed} onToggle={onToggle} onClose={onClose} closeLabel={closeLabel} />
    </header>
  );
}

/** Roll up (or down) and close, as on every window and dialog. */
function WindowButtons({
  collapsed,
  onToggle,
  onClose,
  closeLabel,
  className,
}: Readonly<{
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}>) {
  const roll = t(collapsed ? 'window.expand' : 'window.collapse');
  return (
    <span data-window-controls="" className={cn('flex items-center gap-0.5', className)}>
      <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={roll} title={roll}>
        {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </Button>
      {onClose && (
        <Button variant="close" className="size-6" onClick={onClose} aria-label={closeLabel} title={closeLabel} />
      )}
    </span>
  );
}

export { Window, WindowButtons };
