import { isParty } from '@vtt/shared';
import type { CheckRequestKind } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { CHECK_OPTIONS, checkOf } from '../check-text.ts';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { SelectField } from './kit/select.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The GM asks for a check: from the selected creatures (else the party),
// each for itself, as a group (half must pass), or two in a contest.

const KINDS: { value: CheckRequestKind; label: string; title: string }[] = [
  { value: 'each', label: 'Each', title: 'Everyone rolls for themselves' },
  { value: 'group', label: 'Group', title: 'The group passes when at least half pass' },
  { value: 'contest', label: 'Contest', title: 'Two creatures, the higher total wins' },
];

export function RequestCheckButton({ session }: Readonly<{ session: Session }>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title="Ask the selected creatures (or the party) for a check">
          Request check
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[320px] flex-col gap-2" data-slot="request-check">
        <RequestCheck session={session} />
      </PopoverContent>
    </Popover>
  );
}

function RequestCheck({ session }: Readonly<{ session: Session }>) {
  const [check, setCheck] = useState('wis:perception');
  const [versus, setVersus] = useState('dex:acrobatics');
  const [dc, setDc] = useState(0);
  const [kind, setKind] = useState<CheckRequestKind>('each');
  const all = [...session.tokens.values()].filter((t) => t.sheet !== undefined);
  const selected = all.filter((t) => session.isSelected(t.id));
  const who = selected.length ? selected : all.filter((t) => isParty(t) && !t.monster);
  const contest = kind === 'contest';
  const ready = contest ? who.length === 2 : who.length > 0;
  const send = () =>
    session.requestCheck({
      tokens: who.map((t) => t.id),
      ...checkOf(check),
      kind,
      ...(dc && !contest ? { dc } : {}),
      ...(contest ? { versus: checkOf(versus) } : {}),
    });
  return (
    <>
      <SelectField value={check} onValueChange={setCheck} options={CHECK_OPTIONS} aria-label="Check" />
      <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as CheckRequestKind)}>
        {KINDS.map((k) => (
          <ToggleGroupItem key={k.value} value={k.value} title={k.title}>
            {k.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {contest ? (
        <SelectField value={versus} onValueChange={setVersus} options={CHECK_OPTIONS} aria-label="Against" />
      ) : (
        <label className="flex items-center gap-2 text-sm">
          DC (0: none)
          <NumberField value={dc} min={0} max={40} onValueChange={setDc} aria-label="DC" />
        </label>
      )}
      <p className="text-xs text-muted-foreground">
        {who.map((t) => t.name).join(', ') || 'Select creatures, or put the party on the scene.'}
        {contest && who.length !== 2 && ' A contest needs exactly two selected creatures.'}
      </p>
      <Button size="sm" disabled={!ready} onClick={send}>
        Ask for the check
      </Button>
    </>
  );
}
