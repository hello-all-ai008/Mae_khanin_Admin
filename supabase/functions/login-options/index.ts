// Edge Function: login-options
//
// Unauthenticated *label-only* directory for the staff login screen. The login
// screen must let an operator pick the event and the station/role slot BEFORE
// any PIN is entered, but `public.event_pins` is service-role only (RLS on, no
// policies, no grants to anon/authenticated) and must stay that way. This
// function is the only sanctioned read path: it runs with the service role,
// projects out nothing but names, and never touches `pin_hash`.
//
// Request : GET ?event_id=<uuid>   -> slots for that event
//           GET  (no query string) -> events that have at least one usable PIN
// Response: 200 { events: [...] }  |  200 { event_id, slots: [...] }
//           4xx/5xx { error: string }
//
// SECURITY INVARIANTS FOR ANY FUTURE EDIT
//   * never select `pin_hash`, `auth_user_id`, `failed_attempts` or
//     `locked_until` — the projection lists below are exhaustive on purpose;
//   * never echo whether a PIN attempt would succeed; this endpoint knows
//     nothing about PIN values;
//   * never log a hash, token, or env var.
//
// A slot appearing here proves only that a PIN exists for it, which the printed
// station roster already tells anyone on site. It does not weaken the PIN.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from './cors.ts';

// Bounds the work done for an unauthenticated caller. The 2026-09-12 race has
// ~20 stations; anything approaching this ceiling is a seeding mistake.
const MAX_PIN_ROWS = 500;
const MAX_EVENTS = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PinSlotRow {
  event_id: string;
  station_id: string | null;
  role: string;
}

interface StationRow {
  id: string;
  name: string;
  type: string;
  sequence_order: number | null;
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
 * Every PIN slot that could be logged into right now: active and not expired.
 * Locked-out rows are still listed — hiding them would turn this endpoint into
 * a lockout oracle, and the operator still needs to see their own station.
 */
async function loadUsableSlots(
  client: ServiceClient,
  eventId: string | null,
): Promise<PinSlotRow[]> {
  const nowIso = new Date().toISOString();

  let query = client
    .from('event_pins')
    .select('event_id, station_id, role')
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(MAX_PIN_ROWS);

  if (eventId) query = query.eq('event_id', eventId);

  const { data, error } = await query;
  if (error) {
    console.error('loadUsableSlots failed:', error.message);
    throw new Error('slot lookup failed');
  }
  return (data ?? []) as PinSlotRow[];
}

async function listEvents(client: ServiceClient): Promise<Record<string, unknown>[]> {
  const slots = await loadUsableSlots(client, null);
  const eventIds = [...new Set(slots.map((slot) => slot.event_id))].slice(0, MAX_EVENTS);
  if (eventIds.length === 0) return [];

  const { data, error } = await client
    .from('events')
    .select('id, name, start_date, end_date, status')
    .in('id', eventIds)
    .order('start_date', { ascending: true });

  if (error) {
    console.error('listEvents failed:', error.message);
    throw new Error('event lookup failed');
  }
  return (data ?? []) as Record<string, unknown>[];
}

async function listSlots(
  client: ServiceClient,
  eventId: string,
): Promise<Record<string, unknown>[]> {
  const slots = await loadUsableSlots(client, eventId);
  if (slots.length === 0) return [];

  const stationIds = [...new Set(slots.map((slot) => slot.station_id))].filter(
    (id): id is string => id !== null,
  );

  const stationsById = new Map<string, StationRow>();
  if (stationIds.length > 0) {
    const { data, error } = await client
      .from('stations')
      .select('id, name, type, sequence_order')
      .in('id', stationIds);

    if (error) {
      console.error('listSlots station lookup failed:', error.message);
      throw new Error('station lookup failed');
    }
    for (const station of (data ?? []) as StationRow[]) {
      stationsById.set(station.id, station);
    }
  }

  // Group roles per station slot. `station_id: null` is the event-wide slot
  // (typically ADMIN) and is a legitimate, selectable choice.
  const rolesBySlot = new Map<string, Set<string>>();
  for (const slot of slots) {
    const key = slot.station_id ?? '';
    const roles = rolesBySlot.get(key) ?? new Set<string>();
    roles.add(slot.role);
    rolesBySlot.set(key, roles);
  }

  const rows = [...rolesBySlot.entries()].map(([key, roles]) => {
    const station = key === '' ? undefined : stationsById.get(key);
    return {
      station_id: key === '' ? null : key,
      station_name: station?.name ?? null,
      station_type: station?.type ?? null,
      sequence_order: station?.sequence_order ?? null,
      roles: [...roles].sort(),
    };
  });

  // Stations in course order first, the event-wide slot last.
  return rows.sort((a, b) => {
    if (a.station_id === null) return 1;
    if (b.station_id === null) return -1;
    return (a.sequence_order ?? 0) - (b.sequence_order ?? 0);
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'GET') {
    return jsonResponse(request, { error: 'method_not_allowed' }, 405);
  }

  const eventId = new URL(request.url).searchParams.get('event_id');
  if (eventId !== null && !UUID_RE.test(eventId)) {
    return jsonResponse(request, { error: 'invalid_request' }, 400);
  }

  let client: ServiceClient;
  try {
    client = serviceRoleClient();
  } catch (err) {
    console.error('serviceRoleClient init failed:', err instanceof Error ? err.message : err);
    return jsonResponse(request, { error: 'server_error' }, 500);
  }

  try {
    if (eventId === null) {
      return jsonResponse(request, { events: await listEvents(client) }, 200);
    }
    // An unknown or empty event yields an empty list, never a distinct error:
    // this endpoint does not confirm which event ids exist.
    return jsonResponse(request, { event_id: eventId, slots: await listSlots(client, eventId) }, 200);
  } catch (err) {
    console.error('login-options handler failed:', err instanceof Error ? err.message : err);
    return jsonResponse(request, { error: 'server_error' }, 500);
  }
});
