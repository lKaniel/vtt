import { hitDiceOf, MAX_EXHAUSTION, type TokenView } from '@vtt/system-dnd5e';
import { exhaustionText, hitDiceText } from '../vigour-text.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';

// Exhaustion and hit dice, at the top of the sheet's Effects page. The GM
// sets exhaustion; an owner spends hit dice (a short rest, outside fights).

export function Vigour(props: Readonly<SheetProps>) {
  if (props.value.monster) return null;
  return (
    <div className="mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
      <Exhaustion {...props} />
      <HitDiceRow {...props} />
    </div>
  );
}

function Exhaustion({ session, value, kind, update, edit, sheet }: Readonly<SheetProps>) {
  const level = value.exhaustion ?? 0;
  const set = (n: number) => {
    if (kind === 'token' && !edit) session.setExhaustion(value.id, n);
    else update((d) => ({ ...d, exhaustion: n || undefined }), true);
  };
  return (
    <>
      <span className="font-display text-sm text-gold">Exhaustion</span>
      <span className={level ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {exhaustionText(level, sheet.edition)}
      </span>
      {session.isGm() || edit ? (
        <NumberField
          className="w-24"
          value={level}
          min={0}
          max={MAX_EXHAUSTION}
          onValueChange={set}
          aria-label="Exhaustion level"
        />
      ) : (
        <span className="text-sm">{level}</span>
      )}
    </>
  );
}

function HitDiceRow({ session, value, kind, sheet }: Readonly<SheetProps>) {
  const dice = hitDiceOf(value, sheet);
  if (!dice) return null;
  const mine = kind === 'token' && session.canControl(value as TokenView);
  const hurt = sheet.hp < sheet.maxHp && sheet.hp > 0;
  return (
    <>
      <span className="font-display text-sm text-gold">Hit dice</span>
      <span className="text-sm">{hitDiceText(dice)}</span>
      {mine ? (
        <Button
          variant="outline"
          size="sm"
          disabled={!dice.left || !hurt}
          title="Spend a hit die: roll it plus Constitution and heal that much"
          onClick={() => session.spendHitDie(value.id)}
        >
          Spend
        </Button>
      ) : (
        <span />
      )}
    </>
  );
}
