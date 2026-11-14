import type { Look } from '@vtt/system-dnd5e';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { assetUrl } from '../../assets.ts';
import { t } from '../../i18n/index.ts';
import { newLook } from '../../play/looks.ts';
import { MediaInput } from '../MediaPicker.tsx';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { SelectField } from '../kit/select.tsx';
import { withKey, type Draft } from '../sheet-model.ts';
import type { SheetProps } from './sheet-props.ts';

// The Token tab's looks: other ways the creature can look (disguises), each a
// picture (uploaded, picked, or a web address) and, if set, the name others
// know it by. The one it wears is what everyone else sees on the map, in the
// turn order, on its sheet and in the chat; its owners and the GM see both.

type Props = Readonly<Pick<SheetProps, 'session' | 'value' | 'update'>>;

/** `d` with `looks` changed; the worn look goes with it when it's removed. */
function withLooks(d: Draft, looks: Look[]): Draft {
  const kept = withKey(d, 'looks', looks.length ? looks : undefined);
  return looks.some((l) => l.id === d.look) ? kept : withKey(kept, 'look', undefined);
}

export function LooksFields({ session, value, update }: Props) {
  const looks = value.looks ?? [];
  const save = (next: Look[], now = true) => update((d) => withLooks(d, next), now);
  const change = (id: string, patch: Partial<Look>, now = true) =>
    save(
      looks.map((l) => (l.id === id ? dropEmpty({ ...l, ...patch }) : l)),
      now,
    );
  return (
    <section className="col-span-2 flex flex-col gap-2" aria-label={t('looks.title')}>
      <h4>{t('looks.title')}</h4>
      <p className="text-xs text-muted-foreground">{t('looks.hint')}</p>
      {looks.length > 0 && <Wearing value={value} update={update} />}
      {looks.map((look, i) => (
        <LookRow
          key={look.id}
          session={session}
          look={look}
          title={lookTitle(look, i)}
          ownName={value.name}
          onChange={(patch, now) => change(look.id, patch, now)}
          onRemove={() => save(looks.filter((l) => l.id !== look.id))}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => save([...looks, newLook(looks, t('looks.word'), value.img)])}
      >
        <PlusIcon /> {t('looks.add')}
      </Button>
    </section>
  );
}

/** A look without empty text fields: an empty name means its own name. */
function dropEmpty(look: Look): Look {
  const { name, img, ...rest } = look;
  return { ...rest, ...(name?.trim() && { name }), ...(img && { img }) };
}

/** Which look it wears now: its own, or one of the others. */
function Wearing({ value, update }: Readonly<Pick<SheetProps, 'value' | 'update'>>) {
  return (
    <label className="ed-field">
      <span>{t('looks.wearing')}</span>
      <SelectField
        aria-label={t('looks.wearing')}
        value={value.look ?? ''}
        onValueChange={(id) => update((d) => withKey(d, 'look', id || undefined), true)}
        options={lookOptions(value.looks ?? [])}
      />
    </label>
  );
}

/** The choices of what to wear: its own look first. */
export const lookOptions = (looks: readonly Look[]) => [
  { value: '', label: t('looks.own') },
  ...looks.map((l, i) => ({ value: l.id, label: lookTitle(l, i) })),
];

/** What a look is called in lists: its label, else the name it gives, else its number. */
const lookTitle = (look: Look, i: number) =>
  look.label.trim() ? look.label : (look.name ?? `${t('looks.word')} ${i + 1}`);

type RowProps = Readonly<{
  session: SheetProps['session'];
  look: Look;
  title: string;
  ownName: string;
  onChange: (patch: Partial<Look>, now?: boolean) => void;
  onRemove: () => void;
}>;

function LookRow({ session, look, title, ownName, onChange, onRemove }: RowProps) {
  return (
    <div className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2" data-slot="look-row">
      <span
        className="size-12 rounded-full border border-border bg-cover bg-center"
        style={look.img ? { backgroundImage: `url(${assetUrl(look.img)})` } : undefined}
        aria-hidden
      />
      <Input
        aria-label={t('looks.label')}
        placeholder={t('looks.label')}
        value={look.label}
        onChange={(e) => onChange({ label: e.target.value }, false)}
      />
      <Input
        aria-label={t('looks.name')}
        placeholder={t('looks.namePlaceholder', { name: ownName })}
        value={look.name ?? ''}
        onChange={(e) => onChange({ name: e.target.value }, false)}
      />
      <Button variant="ghost" size="icon-sm" aria-label={t('looks.remove', { look: title })} onClick={onRemove}>
        <Trash2Icon />
      </Button>
      <div className="col-start-2 col-span-3">
        <MediaInput
          key={look.img ?? ''}
          session={session}
          kind="image"
          value={look.img ?? ''}
          onChange={(src) => onChange({ img: src || undefined })}
          placeholder={t('looks.picture')}
          label={t('looks.pictureLabel', { look: title })}
        />
      </div>
    </div>
  );
}
