// Edge Function: staff-login
//
// Exchanges a station PIN for a Supabase session. The PIN table
// (`public.event_pins`) is readable only by the service role, so all PIN
// verification happens here and never in the browser.
//
// Request : POST { event_id: uuid, pin: string, station_id: uuid | null, staffName?: string }
// Response: 200 { token_hash, event_id, station_id, role, label }
//           4xx/5xx { error: string }   <- always generic, never diagnostic
//
// The event/station selector is what the login screen collects BEFORE the PIN
// (see `login-options`). It exists for security, not convenience: it narrows the
// candidate set to ~1 row, so a failed attempt runs one bcrypt comparison
// instead of hundreds, and a lockout can be attributed to the rows the operator
// actually claimed instead of every PIN in the database.
//
// `station_id` is therefore mandatory and has exactly two valid values — a uuid,
// or JSON null for the event-wide slot. Omitting the key is a 400, never a
// silent widening to the whole event (see `parseBody.ts`).
//
// Nothing in this file may log the PIN, the hash, the token, or any env var.

import { createClient } from 'jsr:@supabase/supabase-js@2';
// bcryptjs is a pinned npm package (no deno.land/x third-party host, no
// unpinned integrity). Its promise API processes in chunks and yields to the
// event loop, unlike the WASM `compareSync` this replaced, which blocked the
// whole isolate for the duration of every comparison.
import bcrypt from 'npm:bcryptjs@2.4.3';
import { corsHeaders, jsonResponse } from './cors.ts';
import { type LoginRequest, parseBody } from './parseBody.ts';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// With an event and a station slot both required, the candidate set is expected
// to be one row. The cap is a hard ceiling on bcrypt work per request, not a
// page size: a selector that somehow matches more rows than this is a seeding
// mistake, and we would rather do bounded work than melt the isolate.
const MAX_CANDIDATE_ROWS = 20;

// Single generic failure message. It must not reveal whether the PIN existed,
// whether the row was locked or expired, or how many attempts remain.
const GENERIC_AUTH_ERROR = 'invalid_credentials';

interface EventPinRow {
  id: string;
  event_id: string | null;
  station_id: string | null;
  role: string;
  label: string | null;
  pin_hash: string;
  auth_user_id: string;
}

function serviceRoleClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('Function is not configured');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ServiceClient = ReturnType<typeof serviceRoleClient>;

/**
 * Rows eligible for this attempt: the selected event and station slot, active,
 * not expired, not currently locked out. The station filter is unconditional —
 * `parseBody` guarantees `stationId` is either a uuid or an explicit null.
 *
 * A row whose lockout window has already elapsed is eligible again. Its stale
 * `failed_attempts` counter does not re-lock it on the next miss, because
 * `public.register_pin_failure` restarts the count at 1 for such rows.
 */
async function loadCandidateRows(
  client: ServiceClient,
  request: LoginRequest,
): Promise<EventPinRow[]> {
  const nowIso = new Date().toISOString();

  const base = client
    .from('event_pins')
    .select('id, event_id, station_id, role, label, pin_hash, auth_user_id')
    .eq('event_id', request.eventId)
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .limit(MAX_CANDIDATE_ROWS);

  const query = request.stationId === null
    ? base.is('station_id', null)
    : base.eq('station_id', request.stationId);

  const { data, error } = await query;

  if (error) throw new Error('pin lookup failed');
  return (data ?? []) as EventPinRow[];
}

/**
 * bcrypt.compare performs the constant-time digest comparison internally.
 * PIN strings are never compared with === anywhere in this function.
 *
 * The loop is bounded by MAX_CANDIDATE_ROWS and, because a station slot is
 * always selected, runs a single comparison in practice.
 */
async function matchPin(
  pin: string,
  rows: readonly EventPinRow[],
): Promise<EventPinRow | null> {
  let matched: EventPinRow | null = null;

  for (const row of rows) {
    if (!row.pin_hash) continue;
    // No early break: every candidate is compared, so the response time of a
    // hit does not differ from that of a miss within the same selector.
    const ok = await bcrypt.compare(pin, row.pin_hash);
    if (ok && matched === null) matched = row;
  }

  return matched;
}

/**
 * Atomically increments the counter for exactly the rows this attempt could
 * have matched. The increment lives in a SQL function, not in a read-modify-
 * write from here, so ~20 stations retrying at once cannot lose counts.
 *
 * See README ("Database dependency") for the required function contract.
 */
async function registerFailure(client: ServiceClient, request: LoginRequest): Promise<void> {
  const { error } = await client.rpc('register_pin_failure', {
    p_event_id: request.eventId,
    p_station_id: request.stationId,
    // Always true: `parseBody` requires the caller to name a station slot, so
    // there is no longer an "unscoped" attempt that could increment the counter
    // on every row in the event.
    p_scope_station: true,
    p_max_attempts: MAX_FAILED_ATTEMPTS,
    p_lockout_minutes: LOCKOUT_MINUTES,
  });

  // A counter that failed to persist must not change the response: the caller
  // still gets the same generic 401.
  if (error) return;
}

async function mintTokenHash(
  client: ServiceClient,
  authUserId: string,
): Promise<string | null> {
  const { data: userData, error: userError } = await client.auth.admin.getUserById(authUserId);
  const email = userData?.user?.email;
  if (userError || !email) return null;

  const { data, error } = await client.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) return null;

  return data?.properties?.hashed_token ?? null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'method_not_allowed' }, 405);
  }

  let payload: LoginRequest | null = null;
  try {
    payload = parseBody(await request.json());
  } catch {
    payload = null;
  }

  if (!payload) {
    return jsonResponse(request, { error: 'invalid_request' }, 400);
  }

  let client: ServiceClient;
  try {
    client = serviceRoleClient();
  } catch {
    return jsonResponse(request, { error: 'server_error' }, 500);
  }

  try {
    const candidates = await loadCandidateRows(client, payload);
    const matched = await matchPin(payload.pin, candidates);

    if (!matched) {
      await registerFailure(client, payload);
      return jsonResponse(request, { error: GENERIC_AUTH_ERROR }, 401);
    }

    const tokenHash = await mintTokenHash(client, matched.auth_user_id);
    if (!tokenHash) {
      return jsonResponse(request, { error: 'server_error' }, 500);
    }

    // A correct PIN always clears the counter and any residual lock on its own
    // row, so a run of near-misses can never strand a station that knows its PIN.
    await client
      .from('event_pins')
      .update({ failed_attempts: 0, locked_until: null })
      .eq('id', matched.id);

    return jsonResponse(
      request,
      {
        token_hash: tokenHash,
        event_id: matched.event_id,
        station_id: matched.station_id,
        role: matched.role,
        label: matched.label,
      },
      200,
    );
  } catch {
    // Deliberately opaque: an internal failure must not become an oracle.
    return jsonResponse(request, { error: 'server_error' }, 500);
  }
});
