import { activeKit, characterInventory, type KitStep, partsOf } from '@vtt/system-dnd5e';
import { itemIcon } from '../../icons.ts';
import { itemArt } from '../../icon-art.ts';
import { IconFace } from '../Icon.tsx';
import type { StepProps } from './OriginSteps.tsx';
import { Detail, StepHead } from './Parts.tsx';
import { Toggle } from '../kit/toggle.tsx';
import { t } from '../../i18n/index.ts';

export function EquipmentStep({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  const groups: { title: string; steps: KitStep[] }[] = [
    { title: p.cls?.name ?? t('kit.class'), steps: p.options?.kit ?? [] },
    { title: p.background?.name ?? t('kit.background'), steps: p.background?.kit ?? [] },
  ];
  const items = characterInventory(c, p);
  return (
    <div className="cc-split">
      <div>
        <StepHead title={t('kit.title')} hint={t('kit.hint')} />
        {groups.map((g) => (
          <section key={g.title} className="cc-kit">
            <h3>{g.title}</h3>
            {activeKit(g.steps, c.kit).map(({ step, option }) => (
              <div key={step.id} className="cc-kit-step">
                <p className="cc-label">{step.prompt || t('kit.choose')}</p>
                <div className="cc-chips">
                  {step.options.map((o) => (
                    <Toggle
                      key={o.id}
                      pressed={o.id === option.id}
                      onPressedChange={() => set({ ...c, kit: { ...c.kit, [step.id]: o.id } })}
                    >
                      {o.label}
                    </Toggle>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      <aside className="cc-aside">
        <Detail title={t('kit.carry')}>
          <ul className="cc-items">
            {items.map((i) => {
              const item = p.book.content.items.get(i.item);
              return (
                <li key={i.item} className={i.equipped ? 'equipped' : ''}>
                  <IconFace icon={{ ...itemIcon(item), art: itemArt(item) }} size={16} />
                  <span>{item?.name ?? i.item}</span>
                  {i.qty > 1 && <span className="cc-qty">×{i.qty}</span>}
                </li>
              );
            })}
          </ul>
        </Detail>
      </aside>
    </div>
  );
}
