import { type Character, characterClasses, classLevels, levelDown, totalLevel } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { gameContent } from '../../content/content.ts';
import { t } from '../../i18n/index.ts';
import { Button } from '../kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../kit/dialog.tsx';
import { SelectField } from '../kit/select.tsx';
import { useSaveCharacter } from '../creator/use-save.ts';
import type { SheetProps } from './sheet-props.ts';

// The sheet's Level down: one level less in a class the character has. A
// character made with the creator saves its build a level lower (the rules
// in system-dnd5e level-down.ts take back what the level brought); any other
// asks the server (level-actions.ts), which takes the class level and its
// average hit points.

type Props = Readonly<
  Pick<SheetProps, 'session' | 'kind' | 'value' | 'sheet'> & {
    /** The character's build, when it was made with the creator. */
    build?: Character;
    onSaved: () => void;
    onClose: () => void;
  }
>;

/** The classes it has, with their levels: "Fighter 3". */
function classesOf({ value, sheet, build }: Props): { value: string; label: string; level: number }[] {
  if (build) return characterClasses(build).map((k) => ({ value: k.class, label: k.class, level: k.level }));
  return classLevels({ stats: value.stats }, gameContent(sheet.edition)).map((l) => ({
    value: l.cls?.id ?? l.id,
    label: l.cls?.name ?? l.id,
    level: l.level,
  }));
}

export function LevelDownDialog(props: Props) {
  const { session, kind, value, build, onSaved, onClose } = props;
  const classes = classesOf(props);
  const [classId, setClassId] = useState(classes.at(-1)?.value ?? '');
  const { busy, error, save } = useSaveCharacter(session.gameId ?? '', () => {
    onSaved();
    onClose();
  });
  const from = classes.reduce((n, c) => n + c.level, 0);
  const [problem, next] = lowered(build, classId);
  const confirm = () => {
    if (next) {
      save(next);
      return;
    }
    session.requests.levelDown({ ...(kind === 'token' ? { token: value.id } : { actor: value.id }), class: classId });
    onClose();
  };
  const title = t('levelDown.title', { name: value.name });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(480px,calc(100vw-32px))]" aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {t('levelDown.goesTo', { from, to: from - 1 })} {t(build ? 'levelDown.built' : 'levelDown.actor')}
        </DialogDescription>
        {classes.length > 1 && (
          <SelectField
            value={classId}
            aria-label={t('levelUp.class')}
            onValueChange={setClassId}
            options={classes.map((c) => ({ value: c.value, label: `${capital(c.label)} ${c.level}` }))}
          />
        )}
        {(problem ?? error) && <p className="text-sm text-destructive">{problem ?? error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('levelUp.cancel')}
          </Button>
          <Button disabled={busy || !!problem || from <= 1} onClick={confirm}>
            {t('levelDown.confirm', { level: from - 1 })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The build a level lower, or why it can't be; nothing to work out for a character without a build. */
function lowered(build: Character | undefined, classId: string): [string | undefined, Character | undefined] {
  if (!build || totalLevel(build) <= 1) return [undefined, undefined];
  try {
    return [undefined, levelDown(build, classId)];
  } catch (e) {
    return [(e as Error).message, undefined];
  }
}
