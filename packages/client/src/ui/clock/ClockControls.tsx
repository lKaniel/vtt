import { HourglassIcon, PauseIcon, PlayIcon, SwordsIcon } from 'lucide-react';
import type { Session } from '../../session.ts';
import { quickSkips, turnMode } from '../../session-time.ts';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import { Label } from '../kit/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '../kit/toggle-group.tsx';

/** Game seconds per real second the GM can pick. */
const SPEEDS = [
  { speed: 1, label: '1×', title: 'Real time' },
  { speed: 10, label: '10×', title: '10 game seconds a second' },
  { speed: 60, label: '1 min/s', title: 'A game minute a second' },
  { speed: 600, label: '10 min/s', title: 'Ten game minutes a second' },
  { speed: 3600, label: '1 h/s', title: 'A game hour a second' },
];

/** Start and stop time, real time or turns, how fast it runs, and letting time pass. */
export function ClockControls({ session }: Readonly<{ session: Session }>) {
  const clock = session.clock();
  const running = clock.running === true;
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5">
      <Button
        className="w-28"
        variant={running ? 'outline' : 'default'}
        onClick={() => session.clockAction({ do: running ? 'stop' : 'start' })}
        title={running ? 'Stop the clock' : 'Let time run (it holds still in fights and turn-based mode)'}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
        {running ? 'Stop time' : 'Start time'}
      </Button>
      <ModeToggle session={session} />
      <Label>Speed</Label>
      <ToggleGroup
        type="single"
        value={String(clock.speed)}
        onValueChange={(v) => v && session.clockAction({ do: 'speed', speed: Number(v) })}
        className="w-full"
      >
        {SPEEDS.map((s) => (
          <ToggleGroupItem key={s.speed} value={String(s.speed)} title={s.title}>
            {s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Label>Pass time</Label>
      <div className="flex gap-1">
        {quickSkips.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            size="sm"
            className="flex-1 px-1"
            onClick={() => session.clockAction({ do: 'skip', seconds: s.seconds })}
          >
            {s.label}
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
        <SwordsIcon /> In a fight: 6 seconds a round
      </Badge>
    );
  }
  return (
    <ToggleGroup
      type="single"
      value={mode === 'turns' ? 'turns' : 'free'}
      onValueChange={(v) => v && session.setTurnBased(v === 'turns')}
      className="w-full"
    >
      <ToggleGroupItem value="free" title="Time runs by the clock">
        <PlayIcon /> Real time
      </ToggleGroupItem>
      <ToggleGroupItem value="turns" title="The party takes turns, 6 seconds a round, as in a fight">
        <HourglassIcon /> Turn-based
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
