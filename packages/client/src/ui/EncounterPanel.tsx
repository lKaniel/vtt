import { encounterDifficulty, toEdition } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { gameContent } from '../content.ts';
import { encounterOf, xpShares } from '../encounter-view.ts';
import type { Session } from '../session.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Toggle } from './kit/toggle.tsx';

// The GM's encounter builder: how hard the monsters on the scene are for
// the party (by the world's rules), and the XP to award once they're beaten.

const WARN = new Set(['hard', 'deadly', 'high', 'beyond']);

export function EncounterButton({ session }: Readonly<{ session: Session }>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title="How hard the monsters here are for the party, and their XP">
          Encounter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[340px] flex-col gap-2" data-slot="encounter">
        <EncounterPanel session={session} />
      </PopoverContent>
    </Popover>
  );
}

function EncounterPanel({ session }: Readonly<{ session: Session }>) {
  const edition = toEdition(session.world?.rules);
  const { party, foes } = encounterOf(session.tokens.values(), gameContent(edition));
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const facing = foes.filter((f) => !left.has(f.id));
  const rating = encounterDifficulty(
    party.map((p) => p.level),
    facing.map((f) => f.cr),
    edition,
  );
  const share = xpShares(rating.xp, party.length);
  const toggle = (id: string) =>
    setLeft((was) => (was.has(id) ? new Set([...was].filter((x) => x !== id)) : new Set([...was, id])));
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="font-display text-sm text-gold">Encounter ({edition} rules)</span>
        <Badge variant={WARN.has(rating.difficulty) ? 'warn' : 'default'}>{rating.difficulty}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Party: {party.map((p) => `${p.name} (${p.level})`).join(', ') || 'no characters on the scene'}
      </p>
      <div className="flex flex-wrap gap-1">
        {foes.map((f) => (
          <Toggle key={f.id} pressed={!left.has(f.id)} onPressedChange={() => toggle(f.id)}>
            {f.name} · CR {crText(f.cr)}
          </Toggle>
        ))}
        {!foes.length && <span className="text-xs text-muted-foreground">No monsters on the scene.</span>}
      </div>
      <p className="text-xs">
        {Object.entries(rating.thresholds)
          .map(([name, xp]) => `${name} ${xp}`)
          .join(' · ')}
      </p>
      <p className="text-sm">
        {rating.xp} XP{rating.adjusted !== rating.xp && ` (counts as ${rating.adjusted})`}, {share} each
      </p>
      <Button
        size="sm"
        disabled={!share}
        onClick={() =>
          session.awardXp(
            party.map((p) => p.id),
            share,
          )
        }
      >
        Award {share} XP each
      </Button>
    </>
  );
}

const crText = (cr: number) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[cr] ?? String(cr);
