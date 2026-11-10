import { editionOf, type Monster } from '@vtt/system-dnd5e';
import { gameContent } from '../../content/content.ts';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import { statBlockLines } from '../../text/monster-text.ts';
import { Badge } from '../kit/badge.tsx';
import type { SheetProps } from './sheet-props.ts';

// What a monster's stat block says beyond its numbers: its other speeds,
// languages and alignment on the Details tab, and under its features the
// traits, reactions and odd actions the GM runs as written.

/** The stat block the sheet's creature is built on, if it is a monster. */
export function monsterOf({ session, value }: Readonly<SheetProps>): Monster | undefined {
  if (!value.monster) return undefined;
  const own = value.own?.monsters?.find((m) => m.id === value.monster);
  return own ?? gameContent(editionOf(value, session.world ?? {})).monsters.get(value.monster);
}

const heading = 'm-0 mb-1 border-b border-gold-dim/70 pb-1 font-display text-sm tracking-wider text-gold';

export function StatBlockLines(props: Readonly<SheetProps>) {
  const lines = statBlockLines(monsterOf(props));
  if (!lines.length) return null;
  return (
    <section aria-label={t('sheet.statBlock')}>
      <h4 className={heading}>{t('sheet.statBlock')}</h4>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {lines.map((l) => (
          <div key={l.id} className="contents">
            <dt className="text-muted-foreground">{t(`sheet.statBlock.${l.id}` as MessageKey)}</dt>
            <dd className="m-0">{l.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function MonsterTraits(props: Readonly<SheetProps>) {
  const traits = monsterOf(props)?.traits;
  if (!traits?.length) return null;
  return (
    <section className="mt-3" aria-label={t('sheet.traits')}>
      <h4 className={heading} title={t('sheet.traits.hint')}>
        {t('sheet.traits')}
      </h4>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {traits.map((trait) => (
          <li key={trait.name} className="text-sm leading-snug">
            <span className="font-display text-gold-bright">{trait.name}</span>
            {trait.kind && (
              <Badge variant="muted" className="ml-1.5 align-middle">
                {t(`sheet.trait.${trait.kind}` as MessageKey)}
              </Badge>
            )}
            <p className="m-0 whitespace-pre-line text-foreground/90">{trait.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
