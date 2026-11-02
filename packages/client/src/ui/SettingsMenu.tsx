import { SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { currentMotion, type Motion, setMotion } from '../animations.ts';
import { type Automation, automationOf } from '@vtt/system-dnd5e';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { Label } from './kit/label.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Separator } from './kit/separator.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

interface Choice<K extends keyof Automation> {
  key: K;
  label: string;
  hint: string;
  options: { value: Automation[K]; label: string }[];
}

const OPPORTUNITY: Choice<'opportunity'> = {
  key: 'opportunity',
  label: 'Opportunity attacks',
  hint: 'When an enemy walks out of your reach.',
  options: [
    { value: 'ask', label: 'Ask me' },
    { value: 'auto', label: 'Attack at once' },
    { value: 'never', label: 'Never' },
  ],
};

const HIT: Choice<'hitReactions'> = {
  key: 'hitReactions',
  label: 'Shield, uncanny dodge',
  hint: 'When an attack is about to hit you.',
  options: [
    { value: 'ask', label: 'Ask me' },
    { value: 'never', label: 'Let it land' },
  ],
};

function AutomationRow<K extends keyof Automation>({
  choice,
  value,
  onChange,
}: Readonly<{ choice: Choice<K>; value: Automation[K]; onChange: (v: Automation[K]) => void }>) {
  return (
    <Label className="flex-col items-stretch gap-1">
      {choice.label}
      <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as Automation[K])}>
        {choice.options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="muted text-xs font-normal">{choice.hint}</span>
    </Label>
  );
}

/** Your own options for this game, kept on your seat: how much of the rules runs itself for you. */
export function SettingsMenu({ session }: Readonly<{ session: Session }>) {
  const automation = automationOf(session.you?.settings);
  const set = (patch: Partial<Automation>) => session.setSeatSettings({ ...automation, ...patch });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Settings" title="Your settings">
          <SettingsIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[340px] flex-col gap-3" data-slot="settings-menu">
        <strong className="font-display">Automation</strong>
        <span className="muted -mt-2 text-xs">What the table does for your creatures without asking.</span>
        <Separator ornate />
        <AutomationRow
          choice={OPPORTUNITY}
          value={automation.opportunity}
          onChange={(opportunity) => set({ opportunity })}
        />
        <AutomationRow
          choice={HIT}
          value={automation.hitReactions}
          onChange={(hitReactions) => set({ hitReactions })}
        />
        <Separator />
        <MotionRow />
      </PopoverContent>
    </Popover>
  );
}

const MOTION_LABELS: Record<Motion, string> = { full: 'Full', reduced: 'Reduced', off: 'Numbers only' };

/** How much of the attack and spell animations this browser plays. */
function MotionRow() {
  const [motion, choose] = useState(currentMotion);
  const set = (m: Motion) => {
    setMotion(m);
    choose(m);
  };
  return (
    <Label className="flex-col items-stretch gap-1">
      Animations
      <ToggleGroup type="single" value={motion} onValueChange={(v) => v && set(v as Motion)}>
        {(Object.keys(MOTION_LABELS) as Motion[]).map((m) => (
          <ToggleGroupItem key={m} value={m}>
            {MOTION_LABELS[m]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="muted text-xs font-normal">Kept in this browser. Reduced plays only the hits.</span>
    </Label>
  );
}
