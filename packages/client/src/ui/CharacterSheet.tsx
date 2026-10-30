import { ABILITIES, abilityMod, srd, type TokenView } from '@vtt/shared';
import type { Session } from '../session.ts';
import { describeAttack } from './Hotbar.tsx';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Abilities, defenses, attacks and inventory of a token you control. */
export function CharacterSheet({ session, onClose }: Readonly<{ session: Session; onClose: () => void }>) {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  const sheet = token?.sheet;
  if (!token || !sheet) return null;
  return (
    <section className="sheet" aria-label={`${token.name}'s character sheet`}>
      <header>
        <strong>{token.name}</strong>
        <span className="muted">{token.stats?.class ?? token.monster ?? ''}</span>
        <button className="link" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="sheet-stats">
        <Stat label="HP" value={`${sheet.hp}/${sheet.maxHp}`} />
        <Stat label="AC" value={sheet.ac} />
        <Stat label="Speed" value={`${token.speed} ft`} />
        <Stat label="Init" value={signed(sheet.initiative)} />
        <Stat label="Prof" value={signed(sheet.proficiency)} />
      </div>
      <div className="abilities">
        {ABILITIES.map((a) => (
          <div key={a} className="ability">
            <span className="muted">{a.toUpperCase()}</span>
            <strong>{signed(abilityMod(sheet.abilities[a]))}</strong>
            <span className="muted">{sheet.abilities[a]}</span>
          </div>
        ))}
      </div>
      <h4>Attacks</h4>
      <ul className="sheet-list">
        {sheet.attacks.map((a) => (
          <li key={a.name}>{describeAttack(a)}</li>
        ))}
      </ul>
      <Inventory session={session} token={token} />
    </section>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Inventory({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const items = token.inventory ?? [];
  if (items.length === 0) return null;
  return (
    <>
      <h4>Inventory</h4>
      <ul className="sheet-list">
        {items.map((e, i) => {
          const item = srd.items.get(e.item);
          const wearable = item?.type === 'weapon' || item?.type === 'armor';
          return (
            <li key={`${e.item}-${i}`} className="item">
              <span>
                {item?.name ?? e.item}
                {e.qty > 1 && ` ×${e.qty}`}
              </span>
              {wearable && (
                <label>
                  <input
                    type="checkbox"
                    checked={e.equipped}
                    onChange={(ev) => session.equip(token.id, i, ev.target.checked)}
                  />{' '}
                  equipped
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
