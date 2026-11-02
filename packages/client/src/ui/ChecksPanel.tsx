import { ABILITIES, checkBonus, SKILLS, skillName, type TokenView } from '@vtt/system-dnd5e';
import type { SheetProps } from './CharacterSheet.tsx';
import { Button } from './kit/button.tsx';

// Ability and skill checks on the sheet: each button rolls one into chat
// for the creature's owner.

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

export function ChecksPanel({ session, value, kind, sheet, edit }: Readonly<SheetProps>) {
  if (kind !== 'token' || edit || !session.canControl(value as TokenView)) return null;
  const roll = (ability: (typeof ABILITIES)[number], skill?: string) =>
    session.rollCheck(value.id, { ability, ...(skill && { skill }) });
  return (
    <section className="mb-3 flex flex-col gap-1" data-slot="checks">
      <h4 className="font-display text-sm text-gold">Checks</h4>
      <div className="flex flex-wrap gap-1">
        {ABILITIES.map((a) => (
          <Button key={a} variant="outline" size="sm" onClick={() => roll(a)} title={`Roll a ${a.toUpperCase()} check`}>
            {a.toUpperCase()} {signed(checkBonus(value, sheet, { ability: a }))}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-2">
        {Object.entries(SKILLS).map(([skill, a]) => (
          <Button key={skill} variant="ghost" size="sm" className="justify-between" onClick={() => roll(a, skill)}>
            <span>{skillName(skill)}</span>
            <span>{signed(checkBonus(value, sheet, { ability: a, skill }))}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
