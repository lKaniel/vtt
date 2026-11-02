// Loaded into an e2e server with --import when a spec asks for steady dice:
// Math.random becomes a seeded generator (mulberry32), so the same run rolls
// the same numbers. E2E_RANDOM_SEED is the seed.

let state = Number(process.env.E2E_RANDOM_SEED) >>> 0;

Math.random = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
