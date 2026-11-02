import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Passwords as the server keeps them: a salted scrypt hash, never the
// password itself (accounts, seat passwords).

const derive = promisify(scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export interface Hashed {
  salt: string;
  hash: string;
}

export async function hashSecret(secret: string): Promise<Hashed> {
  const salt = randomBytes(16).toString('base64url');
  return { salt, hash: (await derive(secret, salt, KEY_LENGTH)).toString('base64url') };
}

/** Whether `secret` is the one hashed. */
export async function checkSecret(secret: string, { salt, hash }: Hashed): Promise<boolean> {
  return timingSafeEqual(await derive(secret, salt, KEY_LENGTH), Buffer.from(hash, 'base64url'));
}

/** Compares two plain strings (the admin password from the environment) in constant time. */
export function sameText(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}
