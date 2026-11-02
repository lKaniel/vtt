// The password of a fixed seat (one taken without an account), kept for
// this tab only: the connection sends it each time it (re)connects.

const keyOf = (seat: string) => `vtt.seatKey.${seat}`;

export function seatKey(seat: string): string | undefined {
  try {
    return sessionStorage.getItem(keyOf(seat)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberSeatKey(seat: string, key: string): void {
  try {
    sessionStorage.setItem(keyOf(seat), key);
  } catch {
    // Storage refused (a private window): the seat asks again next time.
  }
}

export function forgetSeatKey(seat: string): void {
  try {
    sessionStorage.removeItem(keyOf(seat));
  } catch {
    // Nothing kept, nothing to forget.
  }
}
