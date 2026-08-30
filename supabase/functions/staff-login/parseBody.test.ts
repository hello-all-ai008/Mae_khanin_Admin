// Unit tests for `staff-login`'s request parser.
//
// Run with a local Deno install (the Supabase CLI's bundled runtime is not on
// PATH):
//
//   deno test supabase/functions/staff-login/parseBody.test.ts
//
// These tests exercise pure validation only — no client, no bcrypt, no network.
// The PINs below are throwaway literals for shape checking; they are not real
// credentials and nothing here is ever hashed or compared.

import { assertEquals } from 'jsr:@std/assert@1';
import { parseBody } from './parseBody.ts';

const EVENT_ID = '8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const STATION_ID = '3ab9c8d7-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

interface Case {
  readonly name: string;
  readonly input: unknown;
  /** null = the body must be rejected (handler answers 400). */
  readonly expected: ReturnType<typeof parseBody>;
}

const cases: readonly Case[] = [
  {
    name: 'accepts a uuid station_id',
    input: { event_id: EVENT_ID, pin: '482913', station_id: STATION_ID },
    expected: {
      eventId: EVENT_ID,
      pin: '482913',
      stationId: STATION_ID,
      staffName: undefined,
    },
  },
  {
    name: 'accepts an explicit null station_id (event-wide / ADMIN slot)',
    input: { event_id: EVENT_ID, pin: '482913', station_id: null },
    expected: {
      eventId: EVENT_ID,
      pin: '482913',
      stationId: null,
      staffName: undefined,
    },
  },
  {
    name: 'accepts a minimal valid request (4-char pin, null station)',
    input: { event_id: EVENT_ID, pin: '0000', station_id: null },
    expected: { eventId: EVENT_ID, pin: '0000', stationId: null, staffName: undefined },
  },
  {
    name: 'trims the pin before length-checking it',
    input: { event_id: EVENT_ID, pin: '  482913  ', station_id: STATION_ID },
    expected: {
      eventId: EVENT_ID,
      pin: '482913',
      stationId: STATION_ID,
      staffName: undefined,
    },
  },
  {
    name: 'trims and caps staffName at 120 chars',
    input: {
      event_id: EVENT_ID,
      pin: '482913',
      station_id: STATION_ID,
      staffName: `  ${'ก'.repeat(200)}  `,
    },
    expected: {
      eventId: EVENT_ID,
      pin: '482913',
      stationId: STATION_ID,
      staffName: 'ก'.repeat(120),
    },
  },
  {
    name: 'ignores a non-string staffName rather than rejecting the request',
    input: { event_id: EVENT_ID, pin: '482913', station_id: null, staffName: 42 },
    expected: { eventId: EVENT_ID, pin: '482913', stationId: null, staffName: undefined },
  },

  // --- station_id is mandatory (N1) -----------------------------------------
  // Omitting it used to widen the attempt, and the failure counter, to every row
  // in the event. On an unauthenticated endpoint that is an event-wide lockout
  // for anyone holding a public event_id.
  {
    name: 'rejects a body with station_id omitted entirely',
    input: { event_id: EVENT_ID, pin: '482913' },
    expected: null,
  },
  {
    name: 'rejects station_id present but undefined (treated as missing)',
    input: { event_id: EVENT_ID, pin: '482913', station_id: undefined },
    expected: null,
  },
  {
    name: 'rejects a non-uuid, non-null station_id',
    input: { event_id: EVENT_ID, pin: '482913', station_id: 'not-a-uuid' },
    expected: null,
  },
  {
    name: 'rejects a numeric station_id',
    input: { event_id: EVENT_ID, pin: '482913', station_id: 7 },
    expected: null,
  },

  // --- event_id --------------------------------------------------------------
  {
    name: 'rejects a missing event_id',
    input: { pin: '482913', station_id: null },
    expected: null,
  },
  {
    name: 'rejects a non-uuid event_id',
    input: { event_id: 'event-1', pin: '482913', station_id: null },
    expected: null,
  },
  {
    name: 'rejects a null event_id',
    input: { event_id: null, pin: '482913', station_id: null },
    expected: null,
  },

  // --- pin -------------------------------------------------------------------
  {
    name: 'rejects a missing pin',
    input: { event_id: EVENT_ID, station_id: null },
    expected: null,
  },
  {
    name: 'rejects a non-string pin',
    input: { event_id: EVENT_ID, pin: 482913, station_id: null },
    expected: null,
  },
  {
    name: 'rejects a pin shorter than 4 chars after trimming',
    input: { event_id: EVENT_ID, pin: ' 123 ', station_id: null },
    expected: null,
  },
  {
    name: 'rejects a pin longer than 12 chars after trimming',
    input: { event_id: EVENT_ID, pin: '1234567890123', station_id: null },
    expected: null,
  },
  {
    name: 'rejects an all-whitespace pin',
    input: { event_id: EVENT_ID, pin: '        ', station_id: null },
    expected: null,
  },

  // --- body shape ------------------------------------------------------------
  { name: 'rejects null', input: null, expected: null },
  { name: 'rejects undefined', input: undefined, expected: null },
  { name: 'rejects a string body', input: 'event_id=1', expected: null },
  { name: 'rejects an empty object', input: {}, expected: null },
];

for (const testCase of cases) {
  Deno.test(`parseBody: ${testCase.name}`, () => {
    // Arrange / Act
    const result = parseBody(testCase.input);

    // Assert
    assertEquals(result, testCase.expected);
  });
}
