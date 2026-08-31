// CORS helpers for the login-options function.
//
// Deliberately identical in discipline to `staff-login/cors.ts` and driven by
// the same `STAFF_LOGIN_ALLOWED_ORIGIN` variable, so there is one origin
// allow-list to maintain for the whole login flow. The allowed origin is
// configuration, never a wildcard.

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173';

function allowedOrigins(): string[] {
  const raw = Deno.env.get('STAFF_LOGIN_ALLOWED_ORIGIN') ?? DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Resolves the `Access-Control-Allow-Origin` value for a request.
 * Falls back to the first configured origin when the caller sends an
 * unknown (or absent) Origin header, so we never echo an untrusted value.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origins = allowedOrigins();
  const requestOrigin = request.headers.get('origin') ?? '';
  const origin = origins.includes(requestOrigin) ? requestOrigin : origins[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
