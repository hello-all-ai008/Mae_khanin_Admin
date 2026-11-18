// Duplicate-scan gate for camera detections. Extracted verbatim (behavior) from
// the inline logic in ScannerInput so it can be unit tested.

export const GLOBAL_SCAN_THROTTLE_MS = 750;
export const SAME_BIB_DEBOUNCE_MATCHED_MS = 2000;
export const SAME_BIB_DEBOUNCE_UNMATCHED_MS = 1200;
export const CLEAR_DELAY_MATCHED_MS = 2200;
export const CLEAR_DELAY_UNMATCHED_MS = 1200;

export function createScanGate() {
  let lastTimestamp = 0;
  let lastBib = '';

  return {
    /** Global throttle: true while within 750 ms of the previous accepted scan. */
    isThrottled(now) {
      return now - lastTimestamp < GLOBAL_SCAN_THROTTLE_MS;
    },

    /**
     * @returns {{ accepted: false } | { accepted: true, clearDelayMs: number }}
     * On accept the gate records the scan; call release(bib) after clearDelayMs.
     */
    accept({ now, bib, matched }) {
      if (!bib) return { accepted: false };
      const sinceLast = now - lastTimestamp;
      const isSameBib = bib === lastBib;
      const minInterval = isSameBib
        ? (matched ? SAME_BIB_DEBOUNCE_MATCHED_MS : SAME_BIB_DEBOUNCE_UNMATCHED_MS)
        : GLOBAL_SCAN_THROTTLE_MS;
      if (sinceLast < minInterval) return { accepted: false };

      lastTimestamp = now;
      lastBib = bib;
      return {
        accepted: true,
        clearDelayMs: matched ? CLEAR_DELAY_MATCHED_MS : CLEAR_DELAY_UNMATCHED_MS,
      };
    },

    /** Forget the last bib if it is still the current one. */
    release(bib) {
      if (lastBib === bib) lastBib = '';
    },
  };
}
