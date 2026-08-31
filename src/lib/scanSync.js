// Writing a scan back to Supabase, for both the live path and the offline queue.
//
// Every update asks for the affected row back with `.select('id')`: RLS answers
// an UPDATE that matches nothing with 204 and no error, and a queued scan that
// is dropped on a 204 is a runner who silently never passed the checkpoint.

import { supabase } from './supabaseClient';
import { writeFailureReason } from './supabaseResult';

const NETWORK_FAILURE_MESSAGE = 'ส่งข้อมูลไม่สำเร็จ (เครือข่ายขัดข้อง)';
const UNKNOWN_TYPE_MESSAGE = 'ชนิดข้อมูลในคิวไม่ถูกต้อง';
const MISSING_RUNNER_MESSAGE = 'ไม่พบรหัสนักวิ่งของรายการนี้';

/**
 * The column patch a queued scan represents.
 * @param {{ type: string, time?: number, cps?: object, operator?: string }} item
 * @returns {object | null} null when the queue item type is unknown
 */
export function patchForQueuedScan(item) {
  if (item?.type === 'CHECKIN') {
    return {
      registration_status: 'CHECKED_IN',
      checked_in_at: new Date(item.time).toISOString(),
      checked_in_by: item.operator,
    };
  }
  if (item?.type === 'CP') return { cps: item.cps };
  if (item?.type === 'FINISH') return { finish: item.time };
  return null;
}

/**
 * Applies a scan patch to one runner row.
 * @param {string} runnerId
 * @param {object} patch
 * @returns {Promise<string | null>} null on success, otherwise a Thai reason
 */
export async function pushScanUpdate(runnerId, patch) {
  if (!runnerId) return MISSING_RUNNER_MESSAGE;
  try {
    const result = await supabase.from('runners').update(patch).eq('id', runnerId).select('id');
    const reason = writeFailureReason(result);
    if (reason && result.error) console.error('Scan write rejected:', result.error);
    return reason;
  } catch (err) {
    console.error('Scan write failed:', err);
    return NETWORK_FAILURE_MESSAGE;
  }
}

/**
 * Pushes a single queued offline scan.
 * @param {{ type: string, runnerId: string }} item
 * @returns {Promise<string | null>} null on success, otherwise a Thai reason
 */
export async function pushQueuedScan(item) {
  const patch = patchForQueuedScan(item);
  if (!patch) return UNKNOWN_TYPE_MESSAGE;
  return pushScanUpdate(item?.runnerId, patch);
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
