import { ABILITIES, abilityMod, srdFor, type TokenView } from '@vtt/shared';
import { useState } from 'react';
import { itemArt } from '../icon-art.ts';
import { itemIcon } from '../icons.ts';
import type { Session } from '../session.ts';
import { attackTip, itemTip } from '../tooltip.ts';
import { IconFace } from './Icon.tsx';
import { MagicSheet } from './MagicSheet.tsx';
import { EffectBadges, Face, HpBar } from './Portrait.tsx';
import { TipCard } from './Tip.tsx';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const ABILITY_NAME = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
} as const;

const PAGES = ['Equipment', 'Spells & features'] as const;
type Page = (typeof PAGES)[number];

/** BG3-style character window: abilities on the left, portrait and vitals in the middle, gear or magic on the right. */
export function CharacterSheet({ session, onClose }: Readonly<{ session: Session; onClose: () => void }>) {
  const [page, setPage] = useState<Page>('Equipment');
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const sheet = token?.sheet;
  if (!token || !sheet) return null;
  const level = token.stats?.level;
  const title = [level && `Level ${level}`, token.stats?.class ?? token.monster].filter(Boolean).join(' ');
  return (
    <section className="sheet frame" aria-label={`${token.name}'s character sheet`}>
      <header className="sheet-head">
        <div>
          <h2>{token.name}</h2>
          <span className="sheet-sub">{title}</span>
        </div>
        <button className="close" onClick={onClose} aria-label="Close (C)">
          ×
        </button>
      </header>
      <div className="sheet-cols">
        <div className="sheet-abilities">
          {ABILITIES.map((a) => (
            <div key={a} className="ability" title={ABILITY_NAME[a]}>
              <span className="ability-name">{a.toUpperCase()}</span>
              <strong className="ability-mod">{signed(abilityMod(sheet.abilities[a]))}</strong>
              <span className="ability-score">{sheet.abilities[a]}</span>
            </div>
          ))}
        </div>
        <div className="sheet-hero">
          <Face token={token} className="hero-face" />
          <HpBar token={token} />
          <EffectBadges token={token} />
          <div className="sheet-stats">
            <Stat label="Armour" value={sheet.ac} />
            <Stat label="Speed" value={`${sheet.speed} ft`} />
            <Stat label="Initiative" value={signed(sheet.initiative)} />
            <Stat label="Proficiency" value={signed(sheet.proficiency)} />
          </div>
          <Defenses token={token} />
        </div>
        <div className="sheet-page">
          <nav className="sheet-tabs">
            {PAGES.map((p) => (
              <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>
                {p}
              </button>
            ))}
          </nav>
          {page === 'Equipment' ? (
            <Equipment session={session} token={token} />
          ) : (
            <MagicSheet session={session} token={token} />
          )}
        </div>
      </div>
    </section>
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

function Defenses({ token }: Readonly<{ token: TokenView }>) {
  const s = token.sheet!;
  const rows: [string, string[]][] = [
    ['Resistant', s.resistances],
    ['Immune', s.immunities],
    ['Vulnerable', s.vulnerabilities],
  ];
  const shown = rows.filter(([, list]) => list.length > 0);
  if (!shown.length) return null;
  return (
    <dl className="defenses">
      {shown.map(([label, list]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{list.join(', ')}</dd>
        </div>
      ))}
    </dl>
  );
}

function Equipment({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const items = token.inventory ?? [];
  return (
    <>
      <h4>Attacks</h4>
      <ul className="rows">
        {token.sheet!.attacks.map((a) => {
          const tip = attackTip(a);
          return (
            <li key={a.name} className="row">
              <span className="row-name">{a.name}</span>
              <span className="row-detail">{tip.facts.slice(1).join(' · ')}</span>
            </li>
          );
        })}
      </ul>
      <h4>Inventory</h4>
      {items.length === 0 && <p className="muted">Empty-handed.</p>}
      <div className="bag">
        {items.map((e, i) => (
          <BagItem key={`${e.item}-${i}`} entry={e} onEquip={(on) => session.equip(token.id, i, on)} />
        ))}
      </div>
    </>
  );
}

function BagItem({
  entry,
  onEquip,
}: Readonly<{ entry: NonNullable<TokenView['inventory']>[number]; onEquip: (equipped: boolean) => void }>) {
  // Weapons and armor are the same in both editions.
  const item = srdFor('2014').items.get(entry.item);
  return (
    <button
      className={entry.equipped ? 'bag-slot equipped' : 'bag-slot'}
      aria-label={item?.name ?? entry.item}
      disabled={!item || item.type === 'gear'}
      onClick={() => onEquip(!entry.equipped)}
    >
      <IconFace icon={{ ...itemIcon(item), art: itemArt(item) }} size={24} />
      {entry.qty > 1 && <span className="bag-qty">{entry.qty}</span>}
      <TipCard tip={itemTip(item, entry.item, entry.equipped)} />
    </button>
  );
}
