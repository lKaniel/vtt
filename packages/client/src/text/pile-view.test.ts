import { srdFor, TokenSchema, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { coinText, pileRows, pileTrader, tradeMessage } from './pile-view.ts';

const book = srdFor('2014');
const token = (data: object): TokenView => TokenSchema.parse({ id: 't', name: 'T', x: 150, y: 150, ...data });
const stall = token({
  id: 'stall',
  name: 'Stall',
  pile: { kind: 'merchant', buy: 2 },
  inventory: [
    { item: 'longsword', qty: 2 },
    { id: 'pack', item: 'backpack' },
    { item: 'rope', in: 'pack' },
    { item: 'bag-of-holding' },
  ],
});

describe('a pile window', () => {
  it('lists the loose gear with what is packed in it, and a merchant’s price for one', () => {
    expect(pileRows(stall, stall.pile!.buy, book)).toEqual([
      { index: 0, name: 'Longsword', qty: 2, price: '30 gp', inside: [] },
      { index: 1, name: 'Backpack', qty: 1, price: '6 gp', inside: ['Rope'] },
      { index: 3, name: 'Bag of Holding', qty: 1, inside: [] },
    ]);
    const chest = token({ id: 'chest', pile: {}, inventory: [{ item: 'torch', qty: 3 }] });
    expect(pileRows(chest, undefined, book)).toEqual([{ index: 0, name: 'Torch', qty: 3, inside: [] }]);
  });

  it('says coins in the biggest ones that fit', () => {
    expect([1500, 50, 7, 0].map(coinText)).toEqual(['15 gp', '5 sp', '7 cp', 'free']);
    expect(coinText(155)).toBe('1 gp 5 sp 5 cp');
  });

  it('trades for the creature you act with: the selected one you control, else your first', () => {
    const hero = token({ id: 'hero' });
    const scout = token({ id: 'scout' });
    const s = { tokens: new Map([stall, hero, scout].map((t) => [t.id, t])), canControl: (t: TokenView) => !t.pile };
    expect(pileTrader({ ...s, selected: 'scout' })?.id).toBe('scout');
    expect(pileTrader({ ...s, selected: 'stall' })?.id).toBe('hero');
  });

  it('asks the server to take, buy, put in and sell', () => {
    expect(tradeMessage('take', { pile: 'chest', trader: 'hero' }, 2)).toEqual({
      t: 'trade',
      from: 'chest',
      to: 'hero',
      item: 2,
    });
    expect(tradeMessage('put', { pile: 'chest', trader: 'hero' }, 0, 3)).toEqual({
      t: 'trade',
      from: 'hero',
      to: 'chest',
      item: 0,
      qty: 3,
    });
  });
});
