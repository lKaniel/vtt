import { describe, expect, it } from 'vitest';
import { gainCoins, payCoins, rebalance } from './purse.ts';

describe('the purse', () => {
  it('pays silver and copper out of gold, keeping the change', () => {
    expect(payCoins({ gp: 5 }, { sp: 3, cp: 2 })).toEqual({ gp: 4, sp: 6, cp: 8 });
  });

  it('pays with the exact coins when it has them', () => {
    expect(payCoins({ gp: 2, sp: 3, cp: 2 }, { sp: 3, cp: 2 })).toEqual({ gp: 2 });
  });

  it('breaks platinum when nothing smaller is left', () => {
    expect(payCoins({ pp: 1 }, { gp: 2, cp: 5 })).toEqual({ gp: 7, sp: 9, cp: 5 });
  });

  it('refuses to pay more than the purse holds', () => {
    expect(payCoins({ sp: 3 }, { gp: 1 })).toBeUndefined();
  });

  it('pays everything down to an empty purse', () => {
    expect(payCoins({ gp: 1 }, { sp: 10 })).toEqual({});
  });

  it('adds coins and gathers small change into bigger coins', () => {
    expect(gainCoins({ cp: 9, sp: 9 }, { cp: 3 })).toEqual({ gp: 1, cp: 2 });
  });

  it('leaves electrum and platinum as they are', () => {
    expect(rebalance({ ep: 3, pp: 2, gp: 25, sp: 12 })).toEqual({ ep: 3, pp: 2, gp: 26, sp: 2 });
  });
});
