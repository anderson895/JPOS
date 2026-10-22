/** An error the client may see: HTTP status + a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Turns thrown ApiErrors into `{ error: { code, message, field? } }` responses.
 * Anything unexpected becomes a generic 500, so internals (or keys) never leak.
 */
export function handle(fn: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await fn(request);
    } catch (err) {
      if (err instanceof ApiError) {
        const error = { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) };
        return json({ error }, err.status);
      }
      console.error('[api] unexpected error:', err);
      return json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, 500);
    }
  };
}

export function requireMethod(request: Request, method: 'GET' | 'POST') {
  if (request.method !== method) throw new ApiError(405, 'method_not_allowed', `Use ${method}.`);
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new ApiError(400, 'invalid_request', 'The request body must be a JSON object.');
}
