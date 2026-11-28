import { encounterDifficulty, toEdition } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { gameContent } from '../content/content.ts';
import { encounterOf, xpShares } from '../text/encounter-view.ts';
import type { Session } from '../session/session.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Toggle } from './kit/toggle.tsx';
import { t } from '../i18n/index.ts';

// The GM's encounter builder: how hard the monsters on the scene are for
// the party (by the world's rules), and the XP to award once they're beaten.

const WARN = new Set(['hard', 'deadly', 'high', 'beyond']);

export function EncounterButton({ session }: Readonly<{ session: Session }>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={t('encounter.buttonTitle')}>
          {t('encounter.button')}
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
        <span className="font-display text-sm text-gold">{t('encounter.title', { edition })}</span>
        <Badge variant={WARN.has(rating.difficulty) ? 'warn' : 'default'}>{rating.difficulty}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('encounter.party', {
          names: party.map((p) => `${p.name} (${p.level})`).join(', ') || t('encounter.noParty'),
        })}
      </p>
      <div className="flex flex-wrap gap-1">
        {foes.map((f) => (
          <Toggle key={f.id} pressed={!left.has(f.id)} onPressedChange={() => toggle(f.id)}>
            {f.name} · CR {crText(f.cr)}
          </Toggle>
        ))}
        {!foes.length && <span className="text-xs text-muted-foreground">{t('encounter.noFoes')}</span>}
      </div>
      <p className="text-xs">
        {Object.entries(rating.thresholds)
          .map(([name, xp]) => `${name} ${xp}`)
          .join(' · ')}
      </p>
      <p className="text-sm">
        {t('encounter.xp', { xp: rating.xp })}
        {rating.adjusted !== rating.xp && ` ${t('encounter.adjusted', { xp: rating.adjusted })}`}
        {t('encounter.share', { xp: share })}
      </p>
      <Button
        size="sm"
        disabled={!share}
        onClick={() =>
          session.requests.awardXp(
            party.map((p) => p.id),
            share,
          )
        }
      >
        {t('encounter.award', { xp: share })}
      </Button>
    </>
  );
}

const crText = (cr: number) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[cr] ?? String(cr);
