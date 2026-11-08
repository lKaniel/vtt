// Words for point pools (a homebrew class's Lucidity) on the sheet and while aiming (see en.ts).

export const EN_POWERS = {
  'pool.left': '{name} {left}/{max}',
  'pool.leftTitle': '{name} left to spend; it comes back on a {rest} rest',
  'pool.concurrent': 'Concurrent {held}/{max}',
  'pool.concurrentTitle': 'What your lasting uses cost at once, out of what they may',
  'pool.reserved': '−{n} reserved',
  'pool.reservedTitle': 'Taken off both maximums until you let go of what reserves it',
  'pool.holding': 'Holding',
  'pool.release': 'Let go',
  'pool.releaseTitle': 'End {name} and free what it holds',
  'pool.short': 'short',
  'pool.long': 'long',
  'power.cost': 'Costs {cost}',
  'power.costWeight': 'Costs {cost} × weight of each target',
  'power.bonus': 'Bonus action',
  'power.bonusTitle': 'Use it as a bonus action (Quick Weave, a follow-up, or once a turn)',
  'power.use': 'Use',
  'power.useAt': 'Use at {n}',
} as const;
