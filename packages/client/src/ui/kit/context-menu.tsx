import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { usePortalHost } from './portal-host.tsx';

// shadcn's context menu (right-click), dressed like the kit's select lists:
// a dark list on a gold rim, items lit on hover, submenus to the side.

function ContextMenu(props: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.Root>>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger(props: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.Trigger>>) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

const LIST =
  'z-[1000] min-w-[11rem] overflow-hidden rounded-md border border-gold-dim bg-popover p-1 font-body text-popover-foreground shadow-[0_10px_30px_rgba(0,0,0,0.7)]';

function ContextMenuContent({
  className,
  ...props
}: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.Content>>) {
  return (
    <ContextMenuPrimitive.Portal container={usePortalHost()}>
      <ContextMenuPrimitive.Content data-slot="context-menu-content" className={cn(LIST, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

const ITEM =
  'relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-gold';

function ContextMenuItem({
  className,
  variant = 'default',
  ...props
}: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.Item> & { variant?: 'default' | 'destructive' }>) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-variant={variant}
      className={cn(ITEM, variant === 'destructive' && 'text-[#ffb3a8] [&_svg]:text-[#ffb3a8]', className)}
      {...props}
    />
  );
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(ITEM, 'pl-7', className)}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon className="text-gold-bright" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

function ContextMenuSub(props: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.Sub>>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}

function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      className={cn(ITEM, 'data-[state=open]:bg-accent', className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

function ContextMenuSubContent({
  className,
  ...props
}: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.SubContent>>) {
  return (
    <ContextMenuPrimitive.Portal container={usePortalHost()}>
      <ContextMenuPrimitive.SubContent
        data-slot="context-menu-sub-content"
        className={cn(LIST, 'max-h-72 overflow-y-auto', className)}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.Separator>>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-gold-dim/50', className)}
      {...props}
    />
  );
}

function ContextMenuLabel({ className, ...props }: Readonly<React.ComponentProps<typeof ContextMenuPrimitive.Label>>) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      className={cn('px-2 py-1 font-display text-xs tracking-wide text-gold-bright', className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
