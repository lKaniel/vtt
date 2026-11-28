import { currentTurn } from '@vtt/system-dnd5e';
import type { SheetProps } from './sheet-props.ts';
import { Button } from '../kit/button.tsx';
import { ResourceMeter } from './ResourceMeter.tsx';
import { t } from '../../i18n/index.ts';

// A legendary creature's pool of legendary actions, its legendary resistance
// and its lair actions, under its features. The GM spends legendary actions
// between other creatures' turns (at the one targeted creature when the
// option attacks) and takes lair actions on the lair's turn.

export function LegendaryPanel(props: Readonly<SheetProps>) {
  const { sheet } = props;
  if (!sheet.legendary && !sheet.legendaryResistance && !sheet.lair) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <LegendaryActions {...props} />
      {sheet.legendaryResistance && (
        <p className="flex items-center gap-1 text-sm">
          <span className="font-display text-gold">{t('legendary.resistance')}</span>
          <ResourceMeter
            resource={{
              key: { kind: 'use', id: 'legendary-resistance' },
              name: t('legendary.resistance'),
              ...sheet.legendaryResistance,
            }}
            edit={props.edit}
            update={props.update}
          />
          {t('legendary.today')}
        </p>
      )}
      <LairActions {...props} />
    </div>
  );
}

const canAct = ({ session, kind, edit }: Readonly<SheetProps>) => kind === 'token' && !edit && session.isGm();

function LegendaryActions(props: Readonly<SheetProps>) {
  const { session, value, sheet } = props;
  const legendary = sheet.legendary;
  if (!legendary) return null;
  const act = canAct(props);
  return (
    <section>
      <h4 className="flex items-center gap-1 font-display text-sm text-gold">
        {t('legendary.actions')}
        <ResourceMeter
          resource={{
            key: { kind: 'use', id: 'legendary' },
            name: t('legendary.actions'),
            left: legendary.left,
            total: legendary.actions,
          }}
          edit={props.edit}
          update={props.update}
        />
      </h4>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {legendary.options.map((o) => (
          <li key={o.id}>
            <Button
              variant="outline"
              size="sm"
              disabled={!act || o.cost > legendary.left}
              title={o.description ?? (o.attack ? t('legendary.attacks') : o.name)}
              onClick={() => session.requests.legendary(value.id, o.id, session.targets.only())}
            >
              {o.name}
              {o.cost > 1 && ` (${o.cost})`}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LairActions(props: Readonly<SheetProps>) {
  const { session, value, sheet } = props;
  if (!sheet.lair) return null;
  const combat = session.combat;
  const lairTurn = !!combat && currentTurn(combat) === `lair:${value.id}`;
  return (
    <section>
      <h4 className="font-display text-sm text-gold">{t('legendary.lair')}</h4>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {sheet.lair.actions.map((a) => (
          <li key={a.id}>
            <Button
              variant="outline"
              size="sm"
              disabled={!canAct(props) || !lairTurn}
              title={a.description ?? t('legendary.lairTitle')}
              onClick={() => session.requests.lairAction(value.id, a.id)}
            >
              {a.name}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
