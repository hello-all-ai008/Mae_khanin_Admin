// Pure zoom bookkeeping: what the UI shows vs. what hardware and CSS actually do.

export const INITIAL_ZOOM_VIEW = Object.freeze({
  displayZoom: 1,
  hardwareZoom: 1,
  cssZoom: 1,
  hasHardwareZoom: false,
});

/** View right after a (re)start: hardware is back at 1x, the remembered zoom is re-applied afterwards. */
export function startZoomView({ displayZoom, hasRange }) {
  return {
    displayZoom,
    hardwareZoom: 1,
    cssZoom: hasRange ? 1 : Math.max(1, displayZoom),
    hasHardwareZoom: hasRange,
  };
}

/**
 * @param {{ requested: number, applied: number | null, hardwareCurrent: number }} input
 *   applied is the hardware level that was set, or null when the request failed/unsupported.
 */
export function resolveZoomOutcome({ requested, applied, hardwareCurrent }) {
  if (applied !== null) {
    return { displayZoom: requested, hardwareZoom: applied, cssZoom: 1, hasHardwareZoom: true };
  }
  // Hardware failed. CSS can only enlarge, so below the real hardware level the UI must show the real level.
  if (requested >= hardwareCurrent) {
    return {
      displayZoom: requested,
      hardwareZoom: hardwareCurrent,
      cssZoom: Math.max(1, requested / hardwareCurrent),
      hasHardwareZoom: false,
    };
  }
  return { displayZoom: hardwareCurrent, hardwareZoom: hardwareCurrent, cssZoom: 1, hasHardwareZoom: false };
}
