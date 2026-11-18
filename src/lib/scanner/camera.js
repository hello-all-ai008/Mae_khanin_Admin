// Camera helpers: stream lifecycle plus best-effort track controls.
// Every control helper is non-fatal: failure is warned and reported as false.

export const IDEAL_WIDTH = 1920;
export const IDEAL_HEIGHT = 1080;
export const IDEAL_FRAME_RATE = 30;
export const FOCUS_RESTORE_DELAY_MS = 1500;

export function buildVideoConstraints(facingMode) {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: IDEAL_WIDTH },
      height: { ideal: IDEAL_HEIGHT },
      frameRate: { ideal: IDEAL_FRAME_RATE },
    },
  };
}

/** Maps getUserMedia failures to a UI-friendly kind. */
export function classifyCameraError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'permission';
  }
  if (name === 'UnsupportedError') return 'unsupported';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'no-camera';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'busy';
  }
  return 'unknown';
}

export async function openStream(facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('getUserMedia unavailable');
    err.name = 'UnsupportedError';
    throw err;
  }
  return navigator.mediaDevices.getUserMedia(buildVideoConstraints(facingMode));
}

export function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch (err) {
      console.warn('Failed to stop camera track:', err);
    }
  });
}

export function getVideoTrack(stream) {
  return stream?.getVideoTracks?.()[0] || null;
}

export function getCapabilities(track) {
  try {
    return track?.getCapabilities?.() || {};
  } catch (err) {
    console.warn('getCapabilities failed:', err);
    return {};
  }
}

async function applyAdvanced(track, constraint) {
  try {
    await track.applyConstraints({ advanced: [constraint] });
    return true;
  } catch (err) {
    console.warn('applyConstraints failed:', constraint, err);
    return false;
  }
}

const supportsMode = (caps, key, mode) => Array.isArray(caps[key]) && caps[key].includes(mode);

/** Continuous autofocus + auto exposure where the device exposes them. */
export async function applyContinuousModes(track) {
  const caps = getCapabilities(track);
  if (supportsMode(caps, 'focusMode', 'continuous')) {
    await applyAdvanced(track, { focusMode: 'continuous' });
  }
  if (supportsMode(caps, 'exposureMode', 'continuous')) {
    await applyAdvanced(track, { exposureMode: 'continuous' });
  }
}

/** Hardware zoom range, or null when unsupported. */
export function getZoomRange(track) {
  const zoom = getCapabilities(track).zoom;
  if (!zoom) return null;
  return { min: zoom.min || 1, max: zoom.max || 5, step: zoom.step || 0 };
}

export function supportsTorch(track) {
  return Boolean(getCapabilities(track).torch);
}

export async function setTorch(track, on) {
  if (!track) return false;
  return applyAdvanced(track, { torch: on });
}

/** Rounds to the device's zoom step (from min) and clamps to [min, max]. */
export function normalizeZoom(level, { min, max, step }) {
  const stepped = step > 0 ? min + Math.round((level - min) / step) * step : level;
  return Math.min(Math.max(stepped, min), max);
}

/** Applies hardware zoom; resolves to the zoom level actually requested, or null on failure/unsupported. */
export async function applyHardwareZoom(track, level) {
  const range = getZoomRange(track);
  if (!track || !range) return null;
  const target = normalizeZoom(level, range);
  const ok = await applyAdvanced(track, { zoom: target });
  return ok ? target : null;
}

/**
 * Tap-to-focus at a normalized (0..1) point, then return to continuous focus.
 * No-op (false) when the device lacks single-shot focus.
 */
export async function focusAtPoint(track, x, y) {
  if (!track) return false;
  const caps = getCapabilities(track);
  if (!supportsMode(caps, 'focusMode', 'single-shot')) return false;

  const supportsPoi =
    'pointsOfInterest' in caps || navigator.mediaDevices?.getSupportedConstraints?.().pointsOfInterest;
  const constraint = supportsPoi
    ? { focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }
    : { focusMode: 'single-shot' };

  const applied = await applyAdvanced(track, constraint);
  if (!applied) return false;

  setTimeout(() => {
    if (track.readyState !== 'live') return;
    if (supportsMode(caps, 'focusMode', 'continuous')) {
      applyAdvanced(track, { focusMode: 'continuous' });
    }
  }, FOCUS_RESTORE_DELAY_MS);
  return true;
}
