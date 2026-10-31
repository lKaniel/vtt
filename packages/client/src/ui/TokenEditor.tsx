import {
  ABILITIES,
  actorFromToken,
  omitKey,
  resolveCreature,
  srdFor,
  uniqueId,
  type Actor,
  type Creature,
  type Edition,
  type TokenView,
} from '@vtt/shared';
import { useState } from 'react';
import type { Session } from '../session.ts';
import { listText, parseList, setAbility, setStat, tokenPatch } from '../token-edit.ts';
import { Check, Field, NumberInput, TextInput } from './EditorFields.tsx';
import { GearColumn } from './EditorLists.tsx';
import { Face } from './Portrait.tsx';

/** What the editor works on: an actor, or a token (an actor with a position). */
export type Draft = Actor & Partial<Pick<TokenView, 'x' | 'y' | 'sheet' | 'health'>>;
export type Update = (fn: (d: Draft) => Draft) => void;

const SIZES = [
  [0.5, 'Tiny'],
  [1, 'Small / Medium'],
  [2, 'Large'],
  [3, 'Huge'],
  [4, 'Gargantuan'],
] as const;

/** The GM's editor for any token on the map or actor in the list. */
export function TokenEditor({ session }: Readonly<{ session: Session }>) {
  const target = session.editing;
  const live = target && (target.kind === 'token' ? session.tokens.get(target.id) : session.actors.get(target.id));
  if (!target || !live || session.you?.role !== 'gm') return null;
  return <EditorWindow key={`${target.kind}:${target.id}`} session={session} kind={target.kind} live={live} />;
}

/** The creature's sheet as the rules would build it, or nothing for a plain token or a bad monster id. */
function preview(draft: Draft, rules: Edition): Creature | undefined {
  try {
    return resolveCreature({ x: 0, y: 0, ...draft }, srdFor(rules));
  } catch {
    return undefined;
  }
}

function EditorWindow({ session, kind, live }: Readonly<{ session: Session; kind: 'token' | 'actor'; live: Draft }>) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const value = draft ?? live;
  const update: Update = (fn) => setDraft(fn(value));
  const rules = value.stats?.rules ?? session.world?.rules ?? '2014';
  const sheet = preview(value, rules);
  const dirty = draft !== null && Object.keys(tokenPatch(live, draft)).length > 0;
  const save = () => {
    if (!draft) return;
    if (kind === 'token') session.editToken(live.id, tokenPatch(live, draft));
    else session.saveActor(draft);
    setDraft(null);
  };
  return (
    <section className="editor frame" aria-label={`Edit ${live.name}`}>
      <EditorHead session={session} kind={kind} value={value} sheet={sheet} />
      <div className="ed-cols">
        <IdentityColumn session={session} kind={kind} value={value} update={update} />
        <RulesColumn session={session} value={value} update={update} sheet={sheet} rules={rules} />
        <GearColumn session={session} value={value} update={update} rules={rules} />
      </div>
      <EditorFooter
        session={session}
        kind={kind}
        live={live}
        dirty={dirty}
        onSave={save}
        onRevert={() => setDraft(null)}
      />
    </section>
  );
}

function EditorHead({
  session,
  kind,
  value,
  sheet,
}: Readonly<{ session: Session; kind: 'token' | 'actor'; value: Draft; sheet: Creature | undefined }>) {
  const what = [kind === 'token' ? 'Token' : 'Actor', value.monster].filter(Boolean).join(' · ');
  const summary = sheet
    ? `AC ${sheet.ac} · HP ${Math.max(0, sheet.hp)}/${sheet.maxHp} · ${sheet.speed} ft`
    : 'No stats';
  return (
    <header className="sheet-head ed-head">
      <Face token={{ x: 0, y: 0, ...value }} className="ed-face" />
      <div>
        <h2>{value.name}</h2>
        <span className="sheet-sub">
          {what} — {summary}
        </span>
      </div>
      <button className="close" onClick={() => session.openEditor(undefined)} aria-label="Close editor">
        ×
      </button>
    </header>
  );
}

function IdentityColumn({
  session,
  kind,
  value,
  update,
}: Readonly<{ session: Session; kind: 'token' | 'actor'; value: Draft; update: Update }>) {
  const set = (key: keyof Draft) => (v: unknown) => update((d) => withKey(d, key, v));
  return (
    <div className="ed-col">
      <h4>Identity</h4>
      <Field label="Name" wide>
        <input type="text" value={value.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />
      </Field>
      <Field label="Picture URL" wide>
        <TextInput value={value.img} onChange={set('img')} placeholder="Default portrait" />
      </Field>
      {kind === 'actor' && (
        <Field label="Folder" wide>
          <TextInput value={value.folder} onChange={set('folder')} placeholder="No folder" />
        </Field>
      )}
      <div className="ed-grid">
        <Field label="Colour">
          <input type="color" value={value.color} onChange={(e) => set('color')(e.target.value)} />
        </Field>
        <Field label="Size">
          <select value={value.size} onChange={(e) => set('size')(Number(e.target.value))}>
            {SIZES.map(([n, label]) => (
              <option key={n} value={n}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Speed (ft)">
          <NumberInput value={value.speed} min={0} onChange={(v) => set('speed')(v ?? 30)} />
        </Field>
        <Field label="Darkvision (ft)">
          <NumberInput value={value.darkvision} min={0} onChange={(v) => set('darkvision')(v ?? 0)} />
        </Field>
      </div>
      <LightFields value={value} update={update} />
      <Check label="Hidden from players" checked={value.hidden} onChange={set('hidden')} />
      <Controllers session={session} value={value} update={update} />
    </div>
  );
}

/** `d` with `key` set, or removed when `v` is undefined. */
function withKey(d: Draft, key: keyof Draft, v: unknown): Draft {
  return v === undefined ? omitKey(d, key) : { ...d, [key]: v };
}

function LightFields({ value, update }: Readonly<{ value: Draft; update: Update }>) {
  const setLight = (bright: number | undefined, dim: number | undefined) =>
    update((d) => withKey(d, 'light', bright || dim ? { bright: bright ?? 0, dim: dim ?? 0 } : undefined));
  return (
    <div className="ed-grid">
      <Field label="Light, bright (ft)">
        <NumberInput
          value={value.light?.bright}
          min={0}
          onChange={(v) => setLight(v, value.light?.dim)}
          placeholder="none"
        />
      </Field>
      <Field label="Light, dim (ft)">
        <NumberInput
          value={value.light?.dim}
          min={0}
          onChange={(v) => setLight(value.light?.bright, v)}
          placeholder="none"
        />
      </Field>
    </div>
  );
}

/** Which players may move the creature. */
function Controllers({ session, value, update }: Readonly<{ session: Session; value: Draft; update: Update }>) {
  const players = session.players.filter((p) => p.role === 'player');
  if (!players.length) return null;
  const toggle = (id: string, on: boolean) =>
    update((d) => ({ ...d, controllers: on ? [...d.controllers, id] : d.controllers.filter((c) => c !== id) }));
  return (
    <>
      <h4>Controlled by</h4>
      <div className="ed-chips">
        {players.map((p) => (
          <Check
            key={p.id}
            label={p.name}
            checked={value.controllers.includes(p.id)}
            onChange={(on) => toggle(p.id, on)}
          />
        ))}
      </div>
    </>
  );
}

function RulesColumn({
  session,
  value,
  update,
  sheet,
  rules,
}: Readonly<{ session: Session; value: Draft; update: Update; sheet: Creature | undefined; rules: Edition }>) {
  const stat = (key: Parameters<typeof setStat>[1]) => (v: unknown) => update((d) => setStat(d, key, v));
  const monsters = [...srdFor(rules).monsters.values()];
  return (
    <div className="ed-col">
      <h4>Rules</h4>
      <div className="ed-grid">
        <Field label="Monster stat block">
          <TextInput
            value={value.monster}
            onChange={(v) => update((d) => withKey(d, 'monster', v))}
            list="ed-monsters"
            placeholder="none"
          />
        </Field>
        <Field label="Rules">
          <select value={value.stats?.rules ?? ''} onChange={(e) => stat('rules')(e.target.value || undefined)}>
            <option value="">World ({session.world?.rules})</option>
            <option value="2014">2014 (SRD 5.1)</option>
            <option value="2024">2024 (SRD 5.2)</option>
          </select>
        </Field>
        <Field label="Class">
          <TextInput value={value.stats?.class} onChange={stat('class')} placeholder="none" />
        </Field>
        <Field label="Level">
          <NumberInput value={value.stats?.level} min={1} onChange={stat('level')} placeholder="—" />
        </Field>
      </div>
      <datalist id="ed-monsters">
        {monsters.map((m) => (
          <option key={m.id} value={m.id} label={m.name} />
        ))}
      </datalist>
      <Vitals value={value} update={update} sheet={sheet} />
      <Abilities value={value} update={update} sheet={sheet} />
      <Defences value={value} update={update} />
    </div>
  );
}

function Vitals({ value, update, sheet }: Readonly<{ value: Draft; update: Update; sheet: Creature | undefined }>) {
  const stat = (key: Parameters<typeof setStat>[1]) => (v: unknown) => update((d) => setStat(d, key, v));
  return (
    <>
      <h4>Vitals</h4>
      <div className="ed-grid">
        <Field label="Hit points">
          <NumberInput
            value={value.hp}
            onChange={(v) => update((d) => withKey(d, 'hp', v))}
            placeholder={sheet ? `${sheet.maxHp} (full)` : '—'}
          />
        </Field>
        <Field label="Max HP">
          <NumberInput value={value.stats?.maxHp} min={1} onChange={stat('maxHp')} placeholder={sheet?.maxHp ?? '—'} />
        </Field>
        <Field label="Armour class">
          <NumberInput value={value.stats?.ac} onChange={stat('ac')} placeholder={sheet?.ac ?? '—'} />
        </Field>
        <Field label="Proficiency">
          <NumberInput
            value={value.stats?.proficiency}
            onChange={stat('proficiency')}
            placeholder={sheet?.proficiency ?? '—'}
          />
        </Field>
      </div>
      {sheet && <HpButtons value={value} update={update} sheet={sheet} />}
    </>
  );
}

/** Quick damage and healing: type an amount, press a button. */
function HpButtons({ value, update, sheet }: Readonly<{ value: Draft; update: Update; sheet: Creature }>) {
  const [amount, setAmount] = useState<number | undefined>();
  const apply = (sign: number) => {
    if (!amount) return;
    const hp = Math.min(sheet.maxHp, Math.max(0, (value.hp ?? sheet.maxHp) + sign * amount));
    update((d) => withKey(d, 'hp', hp >= sheet.maxHp ? undefined : hp));
    setAmount(undefined);
  };
  return (
    <div className="ed-hp">
      <NumberInput value={amount} min={0} onChange={setAmount} placeholder="Amount" />
      <button className="btn small" onClick={() => apply(-1)}>
        Damage
      </button>
      <button className="btn small" onClick={() => apply(1)}>
        Heal
      </button>
    </div>
  );
}

function Abilities({ value, update, sheet }: Readonly<{ value: Draft; update: Update; sheet: Creature | undefined }>) {
  return (
    <>
      <h4>Abilities</h4>
      <div className="ed-abilities">
        {ABILITIES.map((a) => (
          <Field key={a} label={a.toUpperCase()}>
            <NumberInput
              value={value.stats?.abilities?.[a]}
              min={1}
              onChange={(v) => update((d) => setAbility(d, a, v))}
              placeholder={sheet?.abilities[a] ?? 10}
            />
          </Field>
        ))}
      </div>
    </>
  );
}

function Defences({ value, update }: Readonly<{ value: Draft; update: Update }>) {
  const rows = [
    ['resistances', 'Resistant to'],
    ['immunities', 'Immune to'],
    ['vulnerabilities', 'Vulnerable to'],
  ] as const;
  return (
    <>
      <h4>Defences</h4>
      {rows.map(([key, label]) => (
        <Field key={`${key}:${listText(value.stats?.[key])}`} label={label} wide>
          <input
            type="text"
            defaultValue={listText(value.stats?.[key])}
            placeholder="e.g. fire, cold"
            onBlur={(e) => update((d) => setStat(d, key, parseList(e.target.value)))}
          />
        </Field>
      ))}
    </>
  );
}

function EditorFooter({
  session,
  kind,
  live,
  dirty,
  onSave,
  onRevert,
}: Readonly<{
  session: Session;
  kind: 'token' | 'actor';
  live: Draft;
  dirty: boolean;
  onSave: () => void;
  onRevert: () => void;
}>) {
  const [confirm, setConfirm] = useState(false);
  const remove = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    if (kind === 'token') session.deleteToken(live.id);
    else session.deleteActor(live.id);
    session.openEditor(undefined);
  };
  const saveAsActor = () => {
    const id = uniqueId(live.name, (x) => session.actors.has(x));
    session.saveActor(actorFromToken({ x: 0, y: 0, ...live }, id));
  };
  return (
    <footer className="ed-foot">
      <button className="btn" disabled={!dirty} onClick={onSave}>
        Save
      </button>
      <button className="btn" disabled={!dirty} onClick={onRevert}>
        Revert
      </button>
      <span className="ed-spacer" />
      {kind === 'token' ? (
        <button className="btn" onClick={saveAsActor} title="Keep a copy in the Actors list to place again later">
          Save as actor
        </button>
      ) : (
        <button className="btn" onClick={() => session.spawn({ kind: 'actor', id: live.id }, session.viewCentre())}>
          Place on map
        </button>
      )}
      <button className={confirm ? 'btn danger' : 'btn'} onClick={remove} onBlur={() => setConfirm(false)}>
        {confirm ? 'Really delete?' : 'Delete'}
      </button>
    </footer>
  );
}
