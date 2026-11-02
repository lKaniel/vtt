import { useState } from 'react';
import {
  comboOf,
  conflicts,
  currentKeys,
  KEY_ACTIONS,
  type KeyAction,
  keyLabel,
  type Keymap,
  keyOf,
  setKeys,
} from '../keybinds.ts';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './kit/dialog.tsx';

const GROUPS = ['Table', 'Action bar', 'Map tools', 'Walking'] as const;
const IGNORED = new Set(['shift', 'control', 'alt', 'meta', 'escape', 'tab']);

/** The keybindings screen: press a key's button, then the new key; Esc keeps the old one. */
export function KeysDialog() {
  const [keys, setMap] = useState<Keymap>(currentKeys);
  const [listening, setListening] = useState<string>();
  const clashes = conflicts(keys);
  const save = (map: Keymap) => {
    setKeys(map);
    setMap(map);
  };
  const capture = (e: React.KeyboardEvent, action: KeyAction) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const key = e.key.toLowerCase();
    setListening(undefined);
    if (IGNORED.has(key)) return;
    const combo = comboOf(e);
    const { [action.id]: _old, ...rest } = keys;
    save(combo === action.key ? rest : { ...rest, [action.id]: combo });
  };
  return (
    <Dialog onOpenChange={() => setListening(undefined)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Keybindings
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(520px,calc(100vw-32px))]" data-slot="keys-dialog">
        <DialogTitle>Keybindings</DialogTitle>
        <DialogDescription>
          Kept in this browser. Keys with Ctrl (undo, copy, paste) and Esc stay as they are.
        </DialogDescription>
        {GROUPS.map((group) => (
          <section key={group} className="flex flex-col gap-1">
            <strong className="font-display text-gold">{group}</strong>
            {KEY_ACTIONS.filter((a) => a.group === group).map((a) => {
              const key = keyOf(a.id, keys)!;
              const clash = clashes.has(key);
              return (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <span className={clash ? 'text-destructive' : undefined}>
                    {a.label}
                    {clash && ' (shared)'}
                  </span>
                  <Button
                    variant={listening === a.id ? 'default' : 'outline'}
                    size="sm"
                    className="min-w-24"
                    aria-label={`Key for ${a.label}`}
                    onClick={() => setListening(a.id)}
                    onKeyDown={(e) => listening === a.id && capture(e, a)}
                    onBlur={() => setListening(undefined)}
                  >
                    {listening === a.id ? 'Press a key' : keyLabel(key)}
                  </Button>
                </div>
              );
            })}
          </section>
        ))}
        <Button variant="outline" size="sm" disabled={!Object.keys(keys).length} onClick={() => save({})}>
          Back to the defaults
        </Button>
      </DialogContent>
    </Dialog>
  );
}
