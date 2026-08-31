// Helpers for interpreting a supabase-js result.
//
// supabase-js never throws on a rejected write: it resolves with { data, error }.
// Worse, PostgREST answers 204 with no error when RLS filters every target row
// out of an UPDATE or a DELETE, which is indistinguishable from success unless
// the statement asks for the affected rows back with `.select(...)`.
//
// Every write in this app must therefore:
//   1. inspect `error`, and
//   2. append `.select('id')` to updates/deletes and treat zero rows as denied.

const AUTH_ERROR_CODES = new Set([
  'PGRST301', // JWT expired / invalid
  '42501', // insufficient_privilege
]);

const AUTH_ERROR_HINTS = ['jwt', 'permission denied', 'row-level security', 'not authorized'];

export const PERMISSION_DENIED_MESSAGE =
  'ไม่มีสิทธิ์บันทึกข้อมูลนี้ หรือข้อมูลถูกลบไปแล้ว — ระบบไม่ได้บันทึกการเปลี่ยนแปลง';

export const SESSION_REQUIRED_MESSAGE =
  'เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบด้วย PIN อีกครั้ง';

export const GENERIC_WRITE_MESSAGE = 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

/**
 * True when the failure comes from authentication or row-level security rather
 * than from the network or from bad input.
 * @param {{ code?: string, status?: number, message?: string } | null | undefined} error
 * @returns {boolean}
 */
export function isAuthError(error) {
  if (!error) return false;
  if (error.status === 401 || error.status === 403) return true;
  if (error.code && AUTH_ERROR_CODES.has(error.code)) return true;
  const message = String(error.message || '').toLowerCase();
  return AUTH_ERROR_HINTS.some((hint) => message.includes(hint));
}

/**
 * Thai, user-facing message for a failed write. Technical details stay in the console.
 * @param {{ code?: string, status?: number, message?: string } | null | undefined} error
 * @returns {string}
 */
export function writeErrorMessage(error) {
  if (isAuthError(error)) return PERMISSION_DENIED_MESSAGE;
  return error?.message || GENERIC_WRITE_MESSAGE;
}

/**
 * Returns null when the write landed, otherwise a Thai reason string.
 * Pass `requireRows: false` for writes that intentionally return no rows.
 * @param {{ data?: unknown, error?: unknown }} result
 * @param {{ requireRows?: boolean }} [options]
 * @returns {string | null}
 */
export function writeFailureReason(result, { requireRows = true } = {}) {
  const { data, error } = result || {};
  if (error) return writeErrorMessage(error);
  if (!requireRows) return null;
  if (Array.isArray(data)) return data.length > 0 ? null : PERMISSION_DENIED_MESSAGE;
  return data ? null : PERMISSION_DENIED_MESSAGE;
}

/**
 * Throws when a write failed or matched zero rows, so existing try/catch blocks
 * surface an honest message instead of a green toast.
 * @param {{ data?: unknown, error?: unknown }} result
 * @param {{ requireRows?: boolean }} [options]
 * @returns {unknown} the returned rows
 */
export function assertWriteOk(result, { requireRows = true } = {}) {
  const reason = writeFailureReason(result, { requireRows });
  if (reason) {
    if (result?.error) console.error('Supabase write rejected:', result.error);
    throw new Error(reason);
  }
  return result?.data;
}
