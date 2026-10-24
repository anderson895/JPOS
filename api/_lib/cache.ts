import { createClient } from 'redis';

/**
 * A small cache in front of Firestore (Redis Cloud, free plan: REDIS_URL), so
 * busy reads don't all hit Firebase. It never breaks a request: Redis missing,
 * slow or down simply means "not cached", and the request reads Firestore as
 * before. Values are JSON and always expire.
 */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** The parts of a Redis client the cache uses (node-redis has them). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** A cache answer slower than this is skipped (Firestore is read instead). */
export const CACHE_TIMEOUT_MS = 800;

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

const skipped = (what: string, err: unknown) =>
  console.warn(`[cache] ${what} skipped:`, err instanceof Error ? err.message : err);

/** Keys get a prefix (the Firebase project), so test data and live data never mix. */
export function redisCache(connect: () => Promise<RedisLike>, prefix: string, timeoutMs = CACHE_TIMEOUT_MS): Cache {
  const k = (key: string) => `${prefix}:${key}`;
  return {
    async get<T>(key: string) {
      try {
        const raw = await within(connect().then(c => c.get(k(key))), timeoutMs);
        return raw == null ? null : (JSON.parse(raw) as T);
      } catch (err) { skipped('read', err); return null; }
    },
    async set(key, value, ttlSeconds) {
      try { await within(connect().then(c => c.set(k(key), JSON.stringify(value), { EX: Math.max(1, Math.round(ttlSeconds)) })), timeoutMs); }
      catch (err) { skipped('write', err); }
    },
    async del(key) {
      try { await within(connect().then(c => c.del(k(key))), timeoutMs); }
      catch (err) { skipped('delete', err); }
    },
  };
}

/**
 * The Redis address from REDIS_URL, or null. Redis Cloud's "Connect" window
 * copies a whole command ("redis-cli -u redis://..."), so that part is dropped.
 */
export function redisUrlFrom(raw: string | undefined): string | null {
  const url = (raw ?? '').trim().replace(/^redis-cli\s+(-u\s+)?/i, '');
  return /^rediss?:\/\/\S+$/.test(url) ? url : null;
}

/** No REDIS_URL: nothing is cached. */
export const noCache: Cache = { get: async () => null, set: async () => {}, del: async () => {} };

/** Local test mode: kept in this computer's server memory only (never the real Redis). */
export function memoryCache(now: () => number = Date.now): Cache {
  const items = new Map<string, { json: string; until: number }>();
  return {
    async get<T>(key: string) {
      const item = items.get(key);
      if (!item || item.until <= now()) { items.delete(key); return null; }
      return JSON.parse(item.json) as T;
    },
    async set(key, value, ttlSeconds) { items.set(key, { json: JSON.stringify(value), until: now() + ttlSeconds * 1000 }); },
    async del(key) { items.delete(key); },
  };
}

// One connection per warm serverless instance (the free plan allows 30 at once)
let open: Promise<RedisLike> | undefined;

export function connectRedis(url: string): Promise<RedisLike> {
  open ??= (async () => {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 3_000,
        // A couple of quick retries, then give up; the next request starts over
        reconnectStrategy: retries => (retries > 2 ? false : 200),
      },
    });
    client.on('error', err => console.warn('[cache] redis:', err instanceof Error ? err.message : err));
    client.on('end', () => { open = undefined; });
    await client.connect();
    return client as unknown as RedisLike;
  })().catch(err => { open = undefined; throw err; });
  return open;
}
