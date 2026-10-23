import { createHash, randomInt } from 'node:crypto';

/** A sign-up code works for 10 minutes... */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** ...and for 5 tries. After that the owner asks for a new one. */
export const CODE_TRIES = 5;

/** What signupCodes/{id} holds: never the code itself, only its hash. */
export interface StoredCode {
  hash: string;
  expiresAt: number;
  tries: number;
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'locked' }
  | { ok: false; reason: 'wrong'; triesLeft: number };

/** "004821": six random digits. */
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** One id per email address (hashed, so the server-only collections hold no addresses). */
export const emailId = (email: string) => `e_${sha256(email.trim().toLowerCase()).slice(0, 40)}`;

export const codeHash = (id: string, code: string) => sha256(`${id}:${code}`);

/**
 * Checks a typed code against the stored one. `next` is what to store
 * afterwards: null = delete (used, expired or out of tries).
 */
export function checkCode(stored: Partial<StoredCode> | undefined, hash: string, now: number): { result: CodeCheck; next: StoredCode | null } {
  if (!stored || typeof stored.hash !== 'string') return { result: { ok: false, reason: 'missing' }, next: null };
  if (typeof stored.expiresAt !== 'number' || now >= stored.expiresAt) return { result: { ok: false, reason: 'expired' }, next: null };
  const tries = Number(stored.tries ?? 0);
  if (tries >= CODE_TRIES) return { result: { ok: false, reason: 'locked' }, next: null };
  if (stored.hash === hash) return { result: { ok: true }, next: null };
  const used = tries + 1;
  if (used >= CODE_TRIES) return { result: { ok: false, reason: 'locked' }, next: null };
  return { result: { ok: false, reason: 'wrong', triesLeft: CODE_TRIES - used }, next: { hash: stored.hash, expiresAt: stored.expiresAt, tries: used } };
}
