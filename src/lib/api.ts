import { auth } from '@/lib/firebase';

/**
 * Calls JPOS's own server (the Vercel functions in /api) as the signed-in
 * user. Throws an Error with a message that can be shown as is.
 */
export async function callApi<T = Record<string, unknown>>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again, then try once more.');
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach JPOS. Check your internet, then try again.");
  }
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(data?.error?.message || 'Something went wrong. Please try again.');
  return data as T;
}
