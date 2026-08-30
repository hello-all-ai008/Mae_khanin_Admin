import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  GENERIC_WRITE_MESSAGE,
  PERMISSION_DENIED_MESSAGE,
  assertWriteOk,
  isAuthError,
  writeErrorMessage,
  writeFailureReason,
} from './supabaseResult';

afterEach(() => {
  vi.restoreAllMocks();
});

// A PostgREST error as supabase-js surfaces it: resolved, never thrown.
const rlsError = { code: '42501', message: 'permission denied for table runners' };
const networkError = { message: 'Failed to fetch' };

describe('isAuthError', () => {
  test.each([
    ['a 401 status', { status: 401 }],
    ['a 403 status', { status: 403 }],
    ['an insufficient_privilege code', { code: '42501' }],
    ['an expired JWT code', { code: 'PGRST301' }],
    ['a row-level security message', { message: 'new row violates row-level security policy' }],
  ])('is true for %s', (_label, error) => {
    expect(isAuthError(error)).toBe(true);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a network failure', networkError],
  ])('is false for %s', (_label, error) => {
    expect(isAuthError(error)).toBe(false);
  });
});

describe('writeFailureReason', () => {
  test('returns null for a successful write that returned rows', () => {
    expect(writeFailureReason({ data: [{ id: 'runner-1' }], error: null })).toBeNull();
  });

  test('returns null for a successful write that returned a single object', () => {
    expect(writeFailureReason({ data: { id: 'runner-1' }, error: null })).toBeNull();
  });

  test('treats a zero-row result as permission denied', () => {
    // RLS answers an UPDATE that matches no row with 204 and no error. Counting
    // that as success is how a rejected scan used to get a green toast.
    expect(writeFailureReason({ data: [], error: null })).toBe(PERMISSION_DENIED_MESSAGE);
  });

  test('treats a null payload as permission denied', () => {
    expect(writeFailureReason({ data: null, error: null })).toBe(PERMISSION_DENIED_MESSAGE);
  });

  test('reports a real RLS error as permission denied', () => {
    expect(writeFailureReason({ data: null, error: rlsError })).toBe(PERMISSION_DENIED_MESSAGE);
  });

  test('passes a non-auth error message through', () => {
    expect(writeFailureReason({ data: null, error: networkError })).toBe('Failed to fetch');
  });

  test('accepts zero rows when the caller opted out of requiring them', () => {
    expect(writeFailureReason({ data: [], error: null }, { requireRows: false })).toBeNull();
  });

  test('still fails on an error even when rows are not required', () => {
    expect(writeFailureReason({ data: [], error: rlsError }, { requireRows: false })).toBe(
      PERMISSION_DENIED_MESSAGE
    );
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
  ])('treats %s as a failed write rather than a success', (_label, result) => {
    expect(writeFailureReason(result)).toBe(PERMISSION_DENIED_MESSAGE);
  });
});

describe('writeErrorMessage', () => {
  test('maps an auth error to the Thai permission message', () => {
    expect(writeErrorMessage(rlsError)).toBe(PERMISSION_DENIED_MESSAGE);
  });

  test('falls back to a generic message when there is nothing to say', () => {
    expect(writeErrorMessage({})).toBe(GENERIC_WRITE_MESSAGE);
  });
});

describe('assertWriteOk', () => {
  test('returns the rows for a confirmed write', () => {
    const rows = [{ id: 'staff-1' }];
    expect(assertWriteOk({ data: rows, error: null })).toBe(rows);
  });

  test('throws on a zero-row result', () => {
    expect(() => assertWriteOk({ data: [], error: null })).toThrow(PERMISSION_DENIED_MESSAGE);
  });

  test('throws and logs the underlying error on a rejected write', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => assertWriteOk({ data: null, error: rlsError })).toThrow(PERMISSION_DENIED_MESSAGE);
    expect(consoleError).toHaveBeenCalledWith('Supabase write rejected:', rlsError);
  });
});
