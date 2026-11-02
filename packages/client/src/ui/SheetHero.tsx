import { ABILITIES, abilityMod, type Creature } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { listText, parseList, setAbility, setStat } from '../play/token-edit.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { NumberInput } from './EditorFields.tsx';
import { EffectBadges, Face, HpBar } from './Portrait.tsx';
import { withKey } from './sheet-model.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const ABILITY_NAME = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
} as const;

export function Abilities({ value, update, sheet, edit }: Readonly<SheetProps>) {
  return (
    <div className="sheet-abilities">
      {ABILITIES.map((a) => (
        <div key={a} className="ability" title={ABILITY_NAME[a]}>
          <span className="ability-name">{a.toUpperCase()}</span>
          <strong className="ability-mod">{signed(abilityMod(sheet.abilities[a]))}</strong>
          {edit ? (
            <NumberInput
              className="ability-score"
              value={value.stats?.abilities?.[a]}
              min={1}
              placeholder={sheet.abilities[a]}
              onChange={(v) => update((d) => setAbility(d, a, v))}
            />
          ) : (
            <span className="ability-score">{sheet.abilities[a]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Hero(props: Readonly<SheetProps>) {
  const { value, sheet, edit } = props;
  return (
    <div className="sheet-hero">
      <Face token={{ x: 0, y: 0, ...value }} className="hero-face" />
      {edit ? <HpEdit {...props} /> : <HpBar token={{ x: 0, y: 0, ...value, sheet }} />}
      <EffectBadges token={{ x: 0, y: 0, ...value }} />
      {edit ? <StatsEdit {...props} /> : <StatsView sheet={sheet} />}
      <Defenses {...props} />
    </div>
  );
}

function StatsView({ sheet }: Readonly<{ sheet: Creature }>) {
  return (
    <div className="sheet-stats">
      <Stat label="Armour" value={sheet.ac} />
      <Stat label="Speed" value={`${sheet.speed} ft`} />
      <Stat label="Initiative" value={signed(sheet.initiative)} />
      <Stat label="Proficiency" value={signed(sheet.proficiency)} />
    </div>
  );
}

function StatsEdit({ value, update, sheet }: Readonly<SheetProps>) {
  const stat = (key: 'ac' | 'proficiency') => (v: number | undefined) => update((d) => setStat(d, key, v));
  return (
    <div className="sheet-stats">
      <EditStat label="Armour">
        <NumberInput value={value.stats?.ac} placeholder={sheet.ac} onChange={stat('ac')} />
      </EditStat>
      <EditStat label="Speed">
        <NumberInput value={value.speed} min={0} onChange={(v) => update((d) => ({ ...d, speed: v ?? 30 }))} />
      </EditStat>
      <Stat label="Initiative" value={signed(sheet.initiative)} />
      <EditStat label="Proficiency">
        <NumberInput value={value.stats?.proficiency} placeholder={sheet.proficiency} onChange={stat('proficiency')} />
      </EditStat>
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EditStat({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="stat stat-edit">
      {children}
      <span>{label}</span>
    </label>
  );
}

/** Hit points and maximum, plus quick damage and healing. */
function HpEdit({ value, update, sheet }: Readonly<SheetProps>) {
  const [amount, setAmount] = useState<number | undefined>();
  const apply = (sign: number) => {
    if (!amount) return;
    const hp = Math.min(sheet.maxHp, Math.max(0, (value.hp ?? sheet.maxHp) + sign * amount));
    update((d) => withKey(d, 'hp', hp >= sheet.maxHp ? undefined : hp), true);
    setAmount(undefined);
  };
  return (
    <div className="hp-edit">
      <label>
        <span>HP</span>
        <NumberInput
          value={value.hp}
          placeholder={`${sheet.maxHp}`}
          onChange={(v) => update((d) => withKey(d, 'hp', v))}
        />
      </label>
      <label>
        <span>Max</span>
        <NumberInput
          value={value.stats?.maxHp}
          min={1}
          placeholder={sheet.maxHp}
          onChange={(v) => update((d) => setStat(d, 'maxHp', v))}
        />
      </label>
      <NumberInput value={amount} min={0} onChange={setAmount} placeholder="±" />
      <Button variant="outline" size="sm" onClick={() => apply(-1)} title="Take damage">
        Hit
      </Button>
      <Button variant="outline" size="sm" onClick={() => apply(1)} title="Heal">
        Heal
      </Button>
    </div>
  );
}

const DEFENSES = [
  ['resistances', 'Resistant'],
  ['immunities', 'Immune'],
  ['vulnerabilities', 'Vulnerable'],
] as const;

function Defenses({ value, update, sheet, edit }: Readonly<SheetProps>) {
  const shown = DEFENSES.filter(([key]) => edit || sheet[key].length > 0);
  if (!shown.length) return null;
  return (
    <dl className="defenses">
      {shown.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            {edit ? (
              <Input
                key={listText(value.stats?.[key])}
                defaultValue={listText(value.stats?.[key])}
                placeholder={listText(sheet[key]) || 'e.g. fire, cold'}
                onBlur={(e) => update((d) => setStat(d, key, parseList(e.target.value)), true)}
              />
            ) : (
              sheet[key].join(', ')
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
