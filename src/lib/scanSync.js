// Writing a scan back to Supabase via the record_scan RPC — for both the
// live path and the offline queue.
//
// The RPC (supabase/migrations/20260907160000_record_scan_rpc.sql) does the
// actual column write server-side, merging one checkpoint key into `cps`
// instead of replacing the whole map, and only ever setting
// `finish`/`checked_in_at` once. That is what makes first-scan-wins correct
// across multiple devices with different local caches — this file's job is
// only to call it and turn the result into a Thai-facing outcome.

import { supabase } from './supabaseClient';
import { writeErrorMessage } from './supabaseResult';

const NETWORK_FAILURE_MESSAGE = 'ส่งข้อมูลไม่สำเร็จ (เครือข่ายขัดข้อง)';
const UNKNOWN_TYPE_MESSAGE = 'ชนิดข้อมูลในคิวไม่ถูกต้อง';
const MISSING_RUNNER_MESSAGE = 'ไม่พบรหัสนักวิ่งของรายการนี้';

const KNOWN_SCAN_TYPES = new Set(['CHECKIN', 'CP', 'FINISH']);

/**
 * Pushes one scan (live or queued) through the record_scan RPC.
 * @param {{ type: string, runnerId: string, stationId?: string, time: number, operator?: string, isRescan?: boolean }} item
 * @returns {Promise<{ reason: string | null, data: object | null }>}
 *   `reason` is null on success; `data` is the RPC's authoritative
 *   { cps, finish, checked_in_at, registration_status } for the caller to
 *   self-heal its local cache with.
 */
export async function pushScanViaRpc(item) {
  if (!item?.runnerId) return { reason: MISSING_RUNNER_MESSAGE, data: null };
  if (!KNOWN_SCAN_TYPES.has(item?.type)) return { reason: UNKNOWN_TYPE_MESSAGE, data: null };

  try {
    const { data, error } = await supabase.rpc('record_scan', {
      p_runner_id: item.runnerId,
      p_scan_type: item.type,
      p_station_id: item.stationId || null,
      p_scan_time: item.time,
      p_operator: item.operator || null,
      p_is_rescan: !!item.isRescan,
    });

    if (error) {
      console.error('Scan RPC rejected:', error);
      return { reason: writeErrorMessage(error), data: null };
    }
    return { reason: null, data };
  } catch (err) {
    console.error('Scan RPC failed:', err);
    return { reason: NETWORK_FAILURE_MESSAGE, data: null };
  }
}

/**
 * Builds a queue entry. The queue's shape is unchanged; this only removes the
 * copy-paste of the same object literal at three call sites.
 * @param {string} type CHECKIN | CP | FINISH
 * @param {{ runnerId: string, bib: string, operator: string }} scan
 * @param {object} [extras]
 * @returns {object}
 */
export function createQueueItem(type, scan, extras = {}) {
  return {
    id: 'queue_' + Date.now(),
    type,
    runnerId: scan.runnerId,
    bib: scan.bib,
    operator: scan.operator,
    ...extras,
  };
}
