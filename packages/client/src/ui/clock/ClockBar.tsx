import { useEffect, useState } from 'react';
import { dateOf } from '@vtt/shared';
import { cn } from '@/lib/utils';
import type { Session } from '../../session.ts';
import { shortDate, turnMode } from '../../session-time.ts';
import { Badge } from '../kit/badge.tsx';
import { Button } from '../kit/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../kit/popover.tsx';
import { Separator } from '../kit/separator.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../kit/tabs.tsx';
import { CalendarEditor } from './CalendarEditor.tsx';
import { ClockControls } from './ClockControls.tsx';
import { DatePicker } from './DatePicker.tsx';
import { SkyDial } from './SkyDial.tsx';

type Look = 'running' | 'stopped' | 'turns' | 'fight';

const LOOKS: Record<Look, { title: string; badge: string; dot: string; variant: 'good' | 'muted' | 'warn' }> = {
  running: { title: 'Time runs', badge: 'Running', dot: 'bg-gold-bright shadow-[0_0_6px_#e8d3a6]', variant: 'good' },
  stopped: { title: 'Time stands still', badge: 'Stopped', dot: 'bg-muted-foreground/60', variant: 'muted' },
  turns: { title: 'Turn-based: 6 seconds a round', badge: 'Turn-based', dot: 'bg-[#e7b670]', variant: 'warn' },
  fight: { title: 'A fight: 6 seconds a round', badge: 'In a fight', dot: 'bg-destructive', variant: 'warn' },
};

/** Running, standing still, or counting rounds (turn-based mode or a fight). */
function lookOf(session: Session): Look {
  const mode = turnMode(session.combat);
  if (mode === 'fight') return 'fight';
  if (mode === 'turns') return 'turns';
  return session.clock().since === undefined ? 'stopped' : 'running';
}

/** Re-renders every second while the clock runs, so the time shown keeps up. */
function useTicking(on: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [on]);
}

/** The game's date and time in the top bar; the GM's clock opens from it. */
export function ClockBar({ session }: Readonly<{ session: Session }>) {
  const look = lookOf(session);
  useTicking(look === 'running');
  const label = (
    <>
      <span aria-hidden className={cn('size-1.5 rounded-full', LOOKS[look].dot)} />
      {shortDate(session.clock().calendar, session.gameTime())}
    </>
  );
  const title = `${session.dateText()}. ${LOOKS[look].title}`;
  if (!session.isGm()) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={title}>
        {label}
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="font-body text-sm text-foreground" title={title}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-[calc(100vh-80px)] w-[460px] flex-col gap-3 overflow-y-auto">
        <ClockHeader session={session} look={look} />
        <Separator ornate className="-my-1" />
        <ClockControls session={session} />
        <Separator />
        <Tabs defaultValue="date">
          <TabsList>
            <TabsTrigger value="date">Set the date</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
          <TabsContent value="date">
            <DatePicker key={session.clock().time} session={session} />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarEditor session={session} />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

const two = (n: number) => String(n).padStart(2, '0');

/** The sky, the weekday, the long date and the time, and whether time runs. */
function ClockHeader({ session, look }: Readonly<{ session: Session; look: Look }>) {
  const { calendar } = session.clock();
  const d = dateOf(calendar, session.gameTime());
  const era = calendar.era ? ` ${calendar.era}` : '';
  return (
    <div className="flex items-center gap-4">
      <SkyDial calendar={calendar} hour={d.hour + d.minute / 60} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {calendar.weekdays[d.weekday]}
        </span>
        <span className="truncate font-display text-lg text-gold-bright">
          {d.day} {calendar.months[d.month]!.name} {d.year}
          {era}
        </span>
        <span className="text-3xl leading-tight lining-nums tabular-nums text-foreground">
          {two(d.hour)}:{two(d.minute)}
          <span className="ml-0.5 text-base text-muted-foreground">:{two(d.second)}</span>
        </span>
      </div>
      <Badge variant={LOOKS[look].variant} className="self-start">
        {LOOKS[look].badge}
      </Badge>
    </div>
  );
}
