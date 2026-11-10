import { type Character, isCharacter } from '@vtt/system-dnd5e';
import { canControl } from '@vtt/shared';
import { ArrowBigUpDashIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.ts';
import { Button } from '../kit/button.tsx';
import { useBuiltCharacters } from '../creator/BuilderWindow.tsx';
import { LevelUpDialog } from './LevelUpDialog.tsx';
import type { SheetProps } from './sheet-props.ts';

/**
 * The sheet's Level up, for the character's owner and the GM: a character
 * made with the creator levels up through its build (the level up window),
 * any other (imported from Foundry, made on its sheet) here on the sheet.
 */
export function LevelUpButton(props: Readonly<SheetProps>) {
  const { session, kind, value, edit } = props;
  const [open, setOpen] = useState(false);
  const built = useBuiltCharacters(session).list;
  const you = session.you;
  const allowed = !edit && !!you && isCharacter(value) && canControl(value, you);
  const id = kind === 'token' ? (value.actor ?? value.id) : value.id;
  const build = built?.find((c) => c.id === id);
  const asked = useDroppedClass(props, { allowed, built, build });
  if (!allowed) return null;
  const start = () => (build ? session.builder.open({ mode: 'levelup', id: build.id }) : setOpen(true));
  const close = () => {
    setOpen(false);
    if (asked) session.sheets.askLevelUp({ kind, id: value.id }, undefined);
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={start} title={t('levelUp.buttonHint')}>
        <ArrowBigUpDashIcon />
        {t('levelUp.button')}
      </Button>
      {(open || asked) && <LevelUpDialog {...props} initial={asked} onClose={close} />}
    </>
  );
}

/**
 * A class dropped on the sheet (session-sheets.ts askLevelUp): the class the
 * level up dialog opens in, once it is known whether the character has a build.
 * One with a build opens its level up window instead; one the viewer can't
 * level up is told so.
 */
function useDroppedClass(
  { session, kind, value }: Readonly<SheetProps>,
  { allowed, built, build }: { allowed: boolean; built?: readonly Character[]; build?: Character },
): string | undefined {
  const asked = session.sheets.list.find((o) => o.kind === kind && o.id === value.id)?.levelUp;
  useEffect(() => {
    if (!asked || !built || (allowed && !build)) return;
    if (!allowed) session.showError(t('levelUp.notYours', { name: value.name }));
    else if (build) session.builder.open({ mode: 'levelup', id: build.id });
    session.sheets.askLevelUp({ kind, id: value.id }, undefined);
  });
  return asked && built && allowed && !build ? asked : undefined;
}
