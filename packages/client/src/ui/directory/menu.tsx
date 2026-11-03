import type { LucideIcon } from 'lucide-react';
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '../kit/context-menu.tsx';

// What a right-click on a list entry or folder offers: commands, ticked
// choices, and submenus (send a player, move to a folder, a colour).

export interface MenuCommand {
  label: string;
  icon?: LucideIcon;
  run?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** A choice that shows as ticked or not. */
  checked?: boolean;
  /** Opens a submenu instead. */
  items?: MenuEntry[];
  /** A colour swatch beside the label. */
  swatch?: string;
  title?: string;
}

export type MenuEntry = MenuCommand | 'separator';

function Label({ entry }: Readonly<{ entry: MenuCommand }>) {
  const Icon = entry.icon;
  return (
    <>
      {Icon && <Icon />}
      {entry.swatch && (
        <span className="size-3 flex-none rounded-full border border-gold-dim" style={{ background: entry.swatch }} />
      )}
      <span className="truncate">{entry.label}</span>
    </>
  );
}

function Command({ entry }: Readonly<{ entry: MenuCommand }>) {
  if (entry.items) {
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={(entry.disabled ?? false) || !entry.items.length}>
          <Label entry={entry} />
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <MenuItems entries={entry.items} />
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  }
  if (entry.checked !== undefined) {
    return (
      <ContextMenuCheckboxItem
        checked={entry.checked}
        disabled={entry.disabled}
        onSelect={entry.run}
        title={entry.title}
      >
        <Label entry={entry} />
      </ContextMenuCheckboxItem>
    );
  }
  return (
    <ContextMenuItem
      variant={entry.danger ? 'destructive' : 'default'}
      disabled={entry.disabled}
      onSelect={entry.run}
      title={entry.title}
    >
      <Label entry={entry} />
    </ContextMenuItem>
  );
}

export function MenuItems({ entries }: Readonly<{ entries: readonly MenuEntry[] }>) {
  return entries.map((entry, i) =>
    entry === 'separator' ? (
      <ContextMenuSeparator key={`-${i}`} />
    ) : (
      <Command key={`${i}:${entry.label}`} entry={entry} />
    ),
  );
}
