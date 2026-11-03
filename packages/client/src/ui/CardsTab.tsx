import { type Card, cardKey } from '@vtt/shared';
import { useState } from 'react';
import { assetUrl } from '../assets.ts';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import type { CardStackView } from '../session/session-cards.ts';
import { EyeIcon, HandIcon, LayersIcon, ShuffleIcon, SpadeIcon, Trash2Icon, UndoIcon } from 'lucide-react';
import { Directory, type DirItem } from './directory/Directory.tsx';
import type { MenuEntry } from './directory/menu.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogTitle } from './kit/dialog.tsx';
import { NumberField } from './kit/number-field.tsx';
import { SelectField } from './kit/select.tsx';

/**
 * Cards, as in Foundry: decks to draw from, the hands players hold and piles
 * played onto, in folders. Draw into your hand from a deck's menu; open a
 * stack to pick cards in it to play onto a pile or pass on; the GM makes
 * stacks, deals, shuffles and gathers a deck back.
 */
export function CardsTab({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState<string>();
  const stacks = session.cards.stacks();
  const gm = session.isGm();
  const shown = stacks.find((s) => s.id === open);
  return (
    <>
      <Directory
        session={session}
        id="cards"
        items={stacks.map((s) => stackItem(session, s, setOpen))}
        folders={{ kind: 'cards', editable: gm }}
        what={t('cards.what')}
        filters={[
          {
            key: 'kind',
            label: t('cards.kind'),
            options: (['deck', 'hand', 'pile'] as const).map((k) => ({ value: k, label: t(`cards.kind.${k}`) })),
          },
        ]}
        options={gm && <NewCards session={session} />}
        empty={t('cards.none')}
      />
      <Dialog open={!!shown} onOpenChange={(on) => !on && setOpen(undefined)}>
        {shown && (
          <DialogContent>
            <DialogTitle>{shown.name}</DialogTitle>
            <StackCards session={session} stack={shown} stacks={stacks} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

const KIND_ICON = { deck: LayersIcon, hand: HandIcon, pile: SpadeIcon } as const;

function stackItem(session: Session, stack: CardStackView, open: (id: string) => void): DirItem {
  const Icon = KIND_ICON[stack.kind];
  return {
    key: stack.id,
    ref: { coll: 'cards', id: stack.id },
    name: stack.name,
    folder: typeof stack.doc.folder === 'string' ? stack.doc.folder : undefined,
    tags: { kind: stack.kind },
    look: {
      picture: (
        <span className="flex items-center justify-center text-gold">
          <Icon className="size-4" />
        </span>
      ),
      sub: [t(`cards.kind.${stack.kind}`), t('cards.count', { n: stack.count })].join(' · '),
    },
    open: () => open(stack.id),
    menu: [{ label: t('cards.look'), icon: EyeIcon, run: () => open(stack.id) }, ...stackMenu(session, stack)],
  };
}

/** What can be done with a stack: draw from a deck, shuffle one you hold, and the GM's gather and delete. */
function stackMenu(session: Session, stack: CardStackView): MenuEntry[] {
  const hand = session.cards.hands()[0];
  const gm = session.isGm();
  const holds = gm || session.cards.hands().some((h) => h.id === stack.id);
  const out: MenuEntry[] = [];
  if (stack.kind === 'deck' && hand && !gm) {
    out.push({
      label: t('cards.draw'),
      icon: HandIcon,
      disabled: !stack.count,
      run: () => session.cards.draw(stack.id, hand.id),
    });
  }
  if (holds && stack.count > 1)
    out.push({ label: t('cards.shuffle'), icon: ShuffleIcon, run: () => session.cards.shuffle(stack.id) });
  if (gm && stack.kind === 'deck') {
    out.push({
      label: t('cards.gather'),
      icon: UndoIcon,
      title: t('cards.gatherHint'),
      run: () => session.cards.reset(stack.id),
    });
  }
  if (gm) {
    out.push('separator', {
      label: t('list.delete'),
      icon: Trash2Icon,
      danger: true,
      run: () => session.journal.deleteEntry('cards', stack.id),
    });
  }
  return out;
}

/** GM: a new deck (empty, or 52 playing cards), a hand for a player, a pile. */
function NewCards({ session }: Readonly<{ session: Session }>) {
  const players = session.players.filter((p) => p.role !== 'gm');
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button variant="outline" size="sm" onClick={() => session.cards.create('deck', { standard: true })}>
        {t('cards.newPlaying')}
      </Button>
      <Button variant="outline" size="sm" onClick={() => session.cards.create('deck')}>
        {t('cards.newDeck')}
      </Button>
      <Button variant="outline" size="sm" onClick={() => session.cards.create('pile')}>
        {t('cards.newPile')}
      </Button>
      {players.length > 0 && (
        <SelectField
          className="w-36"
          aria-label={t('cards.newHand')}
          placeholder={t('cards.newHand')}
          value=""
          onValueChange={(id) => {
            const p = players.find((x) => x.id === id);
            if (p) session.cards.create('hand', { owner: p.id, name: t('cards.handOf', { name: p.name }) });
          }}
          options={players.map((p) => ({ value: p.id, label: t('cards.handOf', { name: p.name }) }))}
        />
      )}
    </div>
  );
}

/** A stack's cards when you may see them; in one you hold you pick cards to move. */
function StackCards({
  session,
  stack,
  stacks,
}: Readonly<{ session: Session; stack: CardStackView; stacks: CardStackView[] }>) {
  const [picked, setPicked] = useState<string[]>([]);
  const holds = session.isGm() || session.cards.hands().some((h) => h.id === stack.id);
  const toggle = (key: string) => setPicked(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);
  const present = picked.filter((k) => stack.cards.some((c) => cardKey(c) === k));
  return (
    <div className="flex w-full flex-col gap-1.5">
      {session.isGm() && stack.kind === 'deck' && <DealCards session={session} deck={stack} stacks={stacks} />}
      {stack.cards.length === 0 ? (
        <p className="muted">{t(stack.count ? 'cards.faceDown' : 'cards.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {stack.cards.map((c) => (
            <PlayingCard
              key={cardKey(c)}
              card={c}
              picked={present.includes(cardKey(c))}
              onClick={holds ? () => toggle(cardKey(c)) : undefined}
            />
          ))}
        </div>
      )}
      {holds && present.length > 0 && (
        <MoveCards
          stacks={stacks.filter((s) => s.id !== stack.id)}
          onMove={(to) => {
            session.cards.pass(stack.id, to, present);
            setPicked([]);
          }}
        />
      )}
    </div>
  );
}

/** Where picked cards go: played onto a pile, or passed to a hand or back into a deck. */
function MoveCards({ stacks, onMove }: Readonly<{ stacks: CardStackView[]; onMove: (to: string) => void }>) {
  const piles = stacks.filter((s) => s.kind === 'pile');
  const [to, setTo] = useState(piles[0]?.id ?? stacks[0]?.id ?? '');
  const target = stacks.find((s) => s.id === to);
  return (
    <div className="flex gap-1.5">
      <SelectField
        className="min-w-0 flex-1"
        aria-label={t('cards.moveTo')}
        value={to}
        onValueChange={setTo}
        options={stacks.map((s) => ({ value: s.id, label: s.name }))}
      />
      <Button size="sm" disabled={!target} onClick={() => onMove(to)}>
        {t(target?.kind === 'pile' ? 'cards.play' : 'cards.pass')}
      </Button>
    </div>
  );
}

/** GM: `n` cards to every hand. */
function DealCards({
  session,
  deck,
  stacks,
}: Readonly<{ session: Session; deck: CardStackView; stacks: CardStackView[] }>) {
  const [n, setN] = useState(1);
  const hands = stacks.filter((s) => s.kind === 'hand');
  if (!hands.length) return null;
  return (
    <div className="flex items-center gap-1.5">
      <NumberField className="w-16" aria-label={t('cards.dealCount')} value={n} min={1} max={52} onValueChange={setN} />
      <Button
        variant="outline"
        size="sm"
        disabled={!deck.count}
        onClick={() =>
          session.cards.deal(
            deck.id,
            hands.map((h) => h.id),
            n,
          )
        }
      >
        {t('cards.deal', { n: hands.length })}
      </Button>
    </div>
  );
}

const RED = new Set(['♥', '♦']);

/** A card's face: its picture, or its value and suit. */
function PlayingCard({ card, picked, onClick }: Readonly<{ card: Card; picked: boolean; onClick?: () => void }>) {
  const ring = picked ? 'ring-2 ring-gold-bright -translate-y-1' : '';
  const face = card.face ? (
    <img src={assetUrl(card.face)} alt="" className="size-full rounded-[3px] object-cover" draggable={false} />
  ) : (
    <span className={`font-display text-sm leading-tight ${RED.has(card.suit ?? '') ? 'text-[#d9645a]' : ''}`}>
      {card.value ?? card.name}
      <br />
      {card.suit}
    </span>
  );
  return (
    <Button
      variant="outline"
      className={`h-16 w-11 flex-none p-0.5 transition-transform disabled:opacity-100 ${ring}`}
      title={card.text ? `${card.name}: ${card.text}` : card.name}
      aria-label={card.name}
      aria-pressed={picked}
      disabled={!onClick}
      onClick={onClick}
    >
      {face}
    </Button>
  );
}
