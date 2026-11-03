import { t } from '../../i18n/index.ts';
import { ContentText } from '../ContentText.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { withKey } from '../sheet-model.ts';
import { Empty } from './SheetList.tsx';
import type { SheetProps } from './sheet-props.ts';

// The Biography tab: the creature's story, looks and personality, with live
// content links and rolls as in journals; written here in edit mode.

export function BiographyTab({ session, value, update, edit }: Readonly<SheetProps>) {
  if (edit)
    return (
      <Textarea
        className="min-h-[420px] font-body text-sm leading-relaxed"
        aria-label={t('sheet.tab.biography')}
        placeholder={t('sheet.biographyHint')}
        value={value.biography ?? ''}
        onChange={(e) => update((d) => withKey(d, 'biography', e.target.value || undefined))}
      />
    );
  if (!value.biography) return <Empty>{t('sheet.noBiography')}</Empty>;
  return (
    <ContentText session={session} text={value.biography} className="max-w-prose text-sm leading-relaxed [&_p]:mb-3" />
  );
}
