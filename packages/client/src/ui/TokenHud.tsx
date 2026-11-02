import { ConditionSchema, type Condition, type TokenView } from '@vtt/system-dnd5e';
import { XIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { Label } from './kit/label.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Toggle } from './kit/toggle.tsx';

// The token HUD (session-hud.ts): beside one creature you control, its
// conditions, hit points and elevation; for the GM also whether players see
// it and whether it is in the fight.

const WIDTH = 300;
const HEIGHT = 330;

/** The HUD the map's menu opened. A click elsewhere or Esc closes it. */
export function TokenHud({ session }: Readonly<{ session: Session }>) {
  const hud = session.hud;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hud) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) session.closeHud();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && session.closeHud();
    addEventListener('pointerdown', away, true);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', away, true);
      removeEventListener('keydown', esc);
    };
  }, [hud, session]);
  const token = hud && session.tokens.get(hud.token);
  if (!hud || !token) return null;
  const left = Math.max(8, Math.min(hud.screen[0], innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(hud.screen[1], innerHeight - HEIGHT - 8));
  return (
    <div
      ref={box}
      data-slot="token-hud"
      role="dialog"
      aria-label={`${token.name} HUD`}
      className="fixed z-40 flex flex-col gap-2 p-3 art-panel"
      style={{ left, top, width: WIDTH }}
    >
      <div className="flex items-center justify-between">
        <strong className="font-display text-sm text-gold-bright">{token.name}</strong>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => session.closeHud()}>
          <XIcon />
        </Button>
      </div>
      <Numbers session={session} token={token} />
      {session.isGm() && <GmToggles session={session} token={token} />}
      <Conditions session={session} token={token} />
    </div>
  );
}

type Props = Readonly<{ session: Session; token: TokenView }>;

/** Hit points, temporary hit points and elevation. */
function Numbers({ session, token }: Props) {
  const sheet = token.sheet;
  const edit = (patch: Record<string, unknown>) => session.editToken(token.id, patch);
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
      {sheet && (
        <>
          <Label>HP / {sheet.maxHp}</Label>
          <NumberField
            aria-label="Hit points"
            value={Math.min(sheet.hp, sheet.maxHp)}
            min={0}
            max={sheet.maxHp}
            onValueChange={(hp) => edit({ hp })}
          />
          <Label>Temp HP</Label>
          <NumberField
            aria-label="Temporary hit points"
            value={sheet.tempHp}
            min={0}
            onValueChange={(tempHp) => edit({ tempHp })}
          />
        </>
      )}
      <Label>Elevation (ft)</Label>
      <NumberField
        aria-label="Elevation"
        value={token.elevation ?? 0}
        step={5}
        onValueChange={(elevation) => edit({ elevation })}
      />
    </div>
  );
}

/** GM: hidden from players, and in the fight. */
function GmToggles({ session, token }: Props) {
  const fighting = session.combat?.order.some((f) => f.token === token.id);
  return (
    <div className="flex gap-2">
      <Toggle
        variant="plate"
        pressed={token.hidden}
        onPressedChange={(hidden) => session.editToken(token.id, { hidden })}
      >
        Hidden
      </Toggle>
      <Toggle variant="plate" pressed={fighting === true} onPressedChange={(on) => session.setCombatant(token.id, on)}>
        In combat
      </Toggle>
    </div>
  );
}

const nameOf = (c: Condition) => c[0]!.toUpperCase() + c.slice(1);

/** Every condition as a chip: lit when the creature has it. */
function Conditions({ session, token }: Props) {
  const has = new Set(token.sheet?.conditions ?? []);
  return (
    <div className="flex flex-wrap gap-1" aria-label="Conditions">
      {ConditionSchema.options.map((c) => (
        <Toggle
          key={c}
          className="h-6 px-2 text-xs"
          pressed={has.has(c)}
          onPressedChange={(on) => session.setCondition(token.id, c, on)}
        >
          {nameOf(c)}
        </Toggle>
      ))}
    </div>
  );
}
