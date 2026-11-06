import { isCharacter } from '@vtt/system-dnd5e';
import { canControl } from '@vtt/shared';
import { ArrowBigUpDashIcon } from 'lucide-react';
import { useState } from 'react';
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
  if (edit || !you || !isCharacter(value) || !canControl(value, you)) return null;
  const id = kind === 'token' ? (value.actor ?? value.id) : value.id;
  const build = built?.find((c) => c.id === id);
  const start = () => (build ? session.builder.open({ mode: 'levelup', id: build.id }) : setOpen(true));
  return (
    <>
      <Button variant="outline" size="sm" onClick={start} title={t('levelUp.buttonHint')}>
        <ArrowBigUpDashIcon />
        {t('levelUp.button')}
      </Button>
      {open && <LevelUpDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
