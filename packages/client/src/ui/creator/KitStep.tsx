import { activeKit, characterInventory, type KitStep, partsOf } from '@vtt/system-dnd5e';
import { itemIcon } from '../../icons.ts';
import { itemArt } from '../../icon-art.ts';
import { IconFace } from '../Icon.tsx';
import type { StepProps } from './OriginSteps.tsx';
import { Detail, StepHead } from './Parts.tsx';

export function EquipmentStep({ c, set }: Readonly<StepProps>) {
  const p = partsOf(c);
  const groups: { title: string; steps: KitStep[] }[] = [
    { title: p.cls?.name ?? 'Class', steps: p.options?.kit ?? [] },
    { title: p.background?.name ?? 'Background', steps: p.background?.kit ?? [] },
  ];
  const items = characterInventory(c, p);
  return (
    <div className="cc-split">
      <div>
        <StepHead title="Equipment" hint="Your starting kit from your class and background." />
        {groups.map((g) => (
          <section key={g.title} className="cc-kit">
            <h3>{g.title}</h3>
            {activeKit(g.steps, c.kit).map(({ step, option }) => (
              <div key={step.id} className="cc-kit-step">
                <p className="cc-label">{step.prompt || 'Choose'}</p>
                <div className="cc-chips">
                  {step.options.map((o) => (
                    <button
                      key={o.id}
                      className={o.id === option.id ? 'chip on' : 'chip'}
                      onClick={() => set({ ...c, kit: { ...c.kit, [step.id]: o.id } })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      <aside className="cc-aside">
        <Detail title="You carry">
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
