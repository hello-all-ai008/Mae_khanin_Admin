import { supabase } from './supabaseClient';

// Thin client for the unauthenticated `login-options` Edge Function. It is the
// only sanctioned way to read event/station labels for the login screen —
// `public.event_pins` itself is service-role only. See
// `supabase/functions/login-options/index.ts` for the server-side contract.
//
// `supabase.functions.invoke` builds its URL from `${base}/${functionName}`
// with no query-param support beyond `region`, so the event id is appended to
// the function name itself; the Edge Function reads it via
// `new URL(request.url).searchParams`, which parses that correctly.

/**
 * @typedef {{ id: string, name: string, start_date: string, end_date: string, status: string }} LoginEvent
 * @typedef {{ station_id: string|null, station_name: string|null, station_type: string|null, sequence_order: number|null, roles: string[] }} LoginSlot
 */

/**
 * Events that currently have at least one usable PIN.
 * @returns {Promise<LoginEvent[]>}
 */
export async function fetchLoginEvents() {
  const { data, error } = await supabase.functions.invoke('login-options', { method: 'GET' });
  if (error) throw error;
  return Array.isArray(data?.events) ? data.events : [];
}

/**
 * Station/role slots selectable for one event. `station_id: null` in the
 * result is the event-wide slot (e.g. ADMIN) — a legitimate, selectable row,
 * not an error.
 * @param {string} eventId
 * @returns {Promise<LoginSlot[]>}
 */
export async function fetchLoginSlots(eventId) {
  const { data, error } = await supabase.functions.invoke(
    `login-options?event_id=${encodeURIComponent(eventId)}`,
    { method: 'GET' }
  );
  if (error) throw error;
  return Array.isArray(data?.slots) ? data.slots : [];
}
