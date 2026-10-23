import { auth } from '@/lib/firebase';

/** A refusal from JPOS's server. `code` says which one (e.g. 'email_taken'), for the screens that care. */
export class ApiCallError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'ApiCallError';
  }
}

async function post<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new ApiCallError("Couldn't reach JPOS. Check your internet, then try again.", 'network');
  }
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiCallError(data?.error?.message || 'Something went wrong. Please try again.', data?.error?.code);
  return data as T;
}

/**
 * Calls JPOS's own server (the Vercel functions in /api) as the signed-in
 * user. Throws an Error with a message that can be shown as is.
 */
export async function callApi<T = Record<string, unknown>>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiCallError('Sign in again, then try once more.', 'unauthenticated');
  return post<T>(path, body, await user.getIdToken());
}

/** The same, for the few calls made before there is an account (sign-up). */
export function callPublicApi<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
  return post<T>(path, body);
}
