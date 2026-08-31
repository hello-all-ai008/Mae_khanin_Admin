// Request parsing and validation for `staff-login`.
//
// Extracted from `index.ts` so it can be unit tested without a running isolate,
// a service-role key, or a database. This module must stay side-effect free:
// no network, no `Deno.env`, no logging.

const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LoginRequest {
  eventId: string;
  pin: string;
  /**
   * The station slot this attempt is pinned to. `null` means "the event-wide
   * slot" (rows whose `station_id is null`). It is never absent: a request that
   * omits the key is rejected, so every downstream query and every failure
   * counter is scoped to exactly one slot.
   */
  stationId: string | null;
  staffName?: string;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Station selector semantics — the same two cases are applied identically by
 * the candidate query and by the failure counter, so a failure can never touch
 * rows the attempt could not have matched:
 *
 *   station_id: "<uuid>"  -> rows for that station
 *   station_id: null      -> rows with station_id is null (event-wide / ADMIN)
 *
 * There is no third case. `station_id` is mandatory: a body that omits the key
 * (or sends `undefined`) is malformed and rejected with 400. An absent key used
 * to widen the attempt to every row in the event, which let an unauthenticated
 * caller lock every station at once by guessing wrong six times — this endpoint
 * is the login endpoint, so there is no session to stop them.
 */
export function parseBody(raw: unknown): LoginRequest | null {
  if (!raw || typeof raw !== 'object') return null;

  const body = raw as Record<string, unknown>;
  const { event_id: eventId, pin, staffName } = body;

  if (!isUuid(eventId)) return null;
  if (typeof pin !== 'string') return null;

  const trimmed = pin.trim();
  if (trimmed.length < MIN_PIN_LENGTH || trimmed.length > MAX_PIN_LENGTH) return null;

  // The key must be present and must be either a uuid or JSON null.
  // `{ station_id: undefined }` never survives JSON transport, but an in-process
  // caller could construct it; treat it as missing rather than as null.
  if (!Object.hasOwn(body, 'station_id')) return null;
  const rawStation = body.station_id;
  if (rawStation === undefined) return null;
  if (rawStation !== null && !isUuid(rawStation)) return null;

  return {
    eventId,
    pin: trimmed,
    stationId: rawStation === null ? null : rawStation,
    // `staffName` is accepted and length-capped for forward compatibility
    // (a future audit trail). It is intentionally not trusted for identity:
    // identity comes from the PIN row alone.
    staffName: typeof staffName === 'string' ? staffName.trim().slice(0, 120) : undefined,
  };
}
