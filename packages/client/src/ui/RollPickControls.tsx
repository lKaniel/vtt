import type { CritChoice, RollEdge } from '@vtt/system-dnd5e';
import { Dice5Icon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The action bar's roll button: advantage or disadvantage for your next
// attack, check or save, and a critical forced or held back on the next
// attack's damage (session-pick.ts). It lights up while a pick is waiting.

/** The toggles' value for no pick: a normal d20, damage as the d20 rolled it. */
const NORMAL = 'normal';
const AS_ROLLED = 'auto';

/** What the button says: the pick waiting, or "Roll" with none. */
function pickLabel(edge: RollEdge | undefined, crit: CritChoice | undefined): string {
  const parts = [edge && t(`pick.${edge}Short`), crit && t(`pick.${crit}Short`)].filter(Boolean);
  return parts.length ? parts.join(' · ') : t('pick.button');
}

export function RollPickButton({ session }: Readonly<{ session: Session }>) {
  const { edge, crit } = session.actions.pick;
  const label = pickLabel(edge, crit);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={edge || crit ? 'default' : 'ghost'}
          size="sm"
          className="h-6 px-1.5 text-xs"
          title={t('pick.title')}
          aria-label={t('pick.aria', { pick: label })}
        >
          <Dice5Icon />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[280px] flex-col gap-2" data-slot="roll-pick">
        <RollPickPanel session={session} />
      </PopoverContent>
    </Popover>
  );
}

function RollPickPanel({ session }: Readonly<{ session: Session }>) {
  const { pick } = session.actions;
  const choose = (key: 'edge' | 'crit', value: string, none: string) => {
    if (!value) return;
    const next = value === none ? undefined : value;
    if (next !== pick[key]) pick.set({ [key]: next });
  };
  return (
    <>
      <span className="font-display text-sm text-gold">{t('pick.heading')}</span>
      <ToggleGroup
        type="single"
        aria-label={t('pick.edge')}
        value={pick.edge ?? NORMAL}
        onValueChange={(v) => choose('edge', v, NORMAL)}
        className="w-full"
      >
        <ToggleGroupItem value={NORMAL}>{t('pick.normal')}</ToggleGroupItem>
        <ToggleGroupItem value="advantage">{t('pick.advantage')}</ToggleGroupItem>
        <ToggleGroupItem value="disadvantage">{t('pick.disadvantage')}</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        type="single"
        aria-label={t('pick.critLabel')}
        value={pick.crit ?? AS_ROLLED}
        onValueChange={(v) => choose('crit', v, AS_ROLLED)}
        className="w-full"
      >
        <ToggleGroupItem value={AS_ROLLED}>{t('pick.asRolled')}</ToggleGroupItem>
        <ToggleGroupItem value="crit">{t('pick.crit')}</ToggleGroupItem>
        <ToggleGroupItem value="normal">{t('pick.noCrit')}</ToggleGroupItem>
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">{t('pick.hint')}</p>
      <p className="text-xs text-muted-foreground">{t('pick.keys')}</p>
    </>
  );
}
