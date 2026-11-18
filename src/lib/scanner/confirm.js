import { isOneDimensional } from './detector.js';

export const ONE_D_CONFIRM_WINDOW_MS = 500;

function detectionArea(d) {
  const box = d.boundingBox;
  if (box && box.width > 0 && box.height > 0) return box.width * box.height;
  const pts = d.cornerPoints;
  if (!pts || pts.length === 0) return 0;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

function detectionCenter(d) {
  const box = d.boundingBox;
  if (box && box.width > 0 && box.height > 0) {
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  const pts = d.cornerPoints || [];
  if (pts.length === 0) return { x: 0, y: 0 };
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

/** Largest bounding-box area wins; ties go to the code closest to the frame center. */
export function pickBestDetection(detections, frameW, frameH) {
  if (!Array.isArray(detections) || detections.length === 0) return null;
  const cx = frameW / 2;
  const cy = frameH / 2;
  const score = (d) => {
    const c = detectionCenter(d);
    return { area: detectionArea(d), dist: Math.hypot(c.x - cx, c.y - cy) };
  };
  return detections.reduce((best, d) => {
    const a = score(d);
    const b = score(best);
    if (a.area > b.area) return d;
    if (a.area === b.area && a.dist < b.dist) return d;
    return best;
  });
}

/**
 * 2D codes count on first sight. 1D codes need the same rawValue in two
 * detection passes no more than `windowMs` apart.
 */
export function createScanConfirmer({ now = Date.now, windowMs = ONE_D_CONFIRM_WINDOW_MS } = {}) {
  let pending = null;

  return {
    push(detection) {
      if (!detection || !detection.rawValue) return null;
      if (!isOneDimensional(detection.format)) return detection;

      const t = now();
      const isRepeat =
        pending !== null && pending.rawValue === detection.rawValue && t - pending.time <= windowMs;
      if (isRepeat) {
        pending = null;
        return detection;
      }
      pending = { rawValue: detection.rawValue, time: t };
      return null;
    },
    reset() {
      pending = null;
    },
  };
}
