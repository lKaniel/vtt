import { HourglassIcon, PauseIcon, PlayIcon, SwordsIcon } from 'lucide-react';
import type { Session } from '../../session/session.ts';
import { quickSkips, turnMode } from '../../session/session-time.ts';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import { Label } from '../kit/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '../kit/toggle-group.tsx';
import { type MessageKey, t } from '../../i18n/index.ts';

/** Game seconds per real second the GM can pick. */
const SPEEDS: { speed: number; label: MessageKey; title: MessageKey }[] = [
  { speed: 1, label: 'clock.speed1', title: 'clock.speed1Title' },
  { speed: 10, label: 'clock.speed10', title: 'clock.speed10Title' },
  { speed: 60, label: 'clock.speed60', title: 'clock.speed60Title' },
  { speed: 600, label: 'clock.speed600', title: 'clock.speed600Title' },
  { speed: 3600, label: 'clock.speed3600', title: 'clock.speed3600Title' },
];

/** Start and stop time, real time or turns, how fast it runs, and letting time pass. */
export function ClockControls({ session }: Readonly<{ session: Session }>) {
  const clock = session.time.clock();
  const running = clock.running === true;
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5">
      <Button
        className="w-28"
        variant={running ? 'outline' : 'default'}
        onClick={() => session.requests.clockAction({ do: running ? 'stop' : 'start' })}
        title={running ? t('clock.stopTitle') : t('clock.startTitle')}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
        {running ? t('clock.stop') : t('clock.start')}
      </Button>
      <ModeToggle session={session} />
      <Label>{t('clock.speed')}</Label>
      <ToggleGroup
        type="single"
        value={String(clock.speed)}
        onValueChange={(v) => v && session.requests.clockAction({ do: 'speed', speed: Number(v) })}
        className="w-full"
      >
        {SPEEDS.map((s) => (
          <ToggleGroupItem key={s.speed} value={String(s.speed)} title={t(s.title)}>
            {t(s.label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Label>{t('clock.pass')}</Label>
      <div className="flex gap-1">
        {quickSkips.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            size="sm"
            className="flex-1 px-1"
            onClick={() => session.requests.clockAction({ do: 'skip', seconds: s.seconds })}
          >
            {t(s.label)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Real time or turn-based (6 seconds a round, as in a fight); a fight is always turn-based. */
function ModeToggle({ session }: Readonly<{ session: Session }>) {
  const mode = turnMode(session.combat);
  if (mode === 'fight') {
    return (
      <Badge variant="warn" className="justify-self-start">
        <SwordsIcon /> {t('clock.inFight')}
      </Badge>
    );
  }
  return (
    <ToggleGroup
      type="single"
      value={mode === 'turns' ? 'turns' : 'free'}
      onValueChange={(v) => v && session.requests.setTurnBased(v === 'turns')}
      className="w-full"
    >
      <ToggleGroupItem value="free" title={t('clock.realTitle')}>
        <PlayIcon /> {t('clock.real')}
      </ToggleGroupItem>
      <ToggleGroupItem value="turns" title={t('clock.turnsTitle')}>
        <HourglassIcon /> {t('clock.turns')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
