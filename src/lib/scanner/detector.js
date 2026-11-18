// Detector selection: native BarcodeDetector first, zxing-wasm ponyfill as fallback.

export const ONE_D_FORMATS = Object.freeze([
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
]);

// Same set as the previous html5-qrcode setup. itf, codabar and code_93 are
// excluded on purpose: they produce false positives on noisy frames.
export const DETECTOR_FORMATS = Object.freeze([
  'qr_code',
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'data_matrix',
  'pdf417',
]);

// A native implementation is only trusted when it can read both BIB code types.
const REQUIRED_NATIVE_FORMATS = Object.freeze(['qr_code', 'code_128']);

export function isOneDimensional(format) {
  return ONE_D_FORMATS.includes(format);
}

let ponyfillImportPromise = null;

/**
 * Loaded lazily so the wasm decoder is only fetched when native is unavailable.
 * The import promise is cached (shared by warm-up and createDetector) and
 * cleared on failure so a retry really re-runs the load.
 */
export function defaultLoadPonyfill() {
  if (!ponyfillImportPromise) {
    ponyfillImportPromise = import('./ponyfillLoader.js')
      .then((mod) => mod.loadPonyfill())
      .catch((err) => {
        ponyfillImportPromise = null;
        throw err;
      });
  }
  return ponyfillImportPromise;
}

/** Forgets the cached decoder so the next load starts fresh (used after repeated decode failures). */
export async function resetPonyfill() {
  ponyfillImportPromise = null;
  try {
    const mod = await import('./ponyfillLoader.js');
    mod.resetPonyfill();
  } catch (err) {
    console.warn('Ponyfill reset failed:', err);
  }
}

async function tryCreateNative(nativeCtor) {
  if (typeof nativeCtor !== 'function') return null;
  try {
    const supported = await nativeCtor.getSupportedFormats();
    const hasRequired = REQUIRED_NATIVE_FORMATS.every((f) => supported.includes(f));
    if (!hasRequired) return null;
    const formats = DETECTOR_FORMATS.filter((f) => supported.includes(f));
    return new nativeCtor({ formats });
  } catch {
    return null;
  }
}

/**
 * Background pre-load of the wasm decoder (call on mount) so the camera can
 * open offline later. Errors are swallowed; opening the camera retries.
 */
export async function warmUpDetector({
  nativeCtor = globalThis.BarcodeDetector,
  loadPonyfill = defaultLoadPonyfill,
} = {}) {
  try {
    if (await tryCreateNative(nativeCtor)) return;
    await loadPonyfill();
  } catch {
    // intentionally ignored: a later camera open retries the load
  }
}

/**
 * @param {{ nativeCtor?: Function, loadPonyfill?: () => Promise<{ BarcodeDetector: Function }> }} [options]
 * @returns {Promise<{ detector: { detect: Function }, kind: 'native' | 'ponyfill' }>}
 */
export async function createDetector({
  nativeCtor = globalThis.BarcodeDetector,
  loadPonyfill = defaultLoadPonyfill,
} = {}) {
  const native = await tryCreateNative(nativeCtor);
  if (native) return { detector: native, kind: 'native' };

  const { BarcodeDetector: PonyDetector } = await loadPonyfill();
  return { detector: new PonyDetector({ formats: [...DETECTOR_FORMATS] }), kind: 'ponyfill' };
}

const scalePoint = (p, factor) => ({ x: p.x * factor, y: p.y * factor });

/** Returns a copy of the detection with geometry multiplied by `factor` (immutable). */
export function scaleDetection(detection, factor) {
  const { boundingBox, cornerPoints } = detection;
  return {
    rawValue: detection.rawValue,
    format: detection.format,
    boundingBox: boundingBox
      ? {
          x: boundingBox.x * factor,
          y: boundingBox.y * factor,
          width: boundingBox.width * factor,
          height: boundingBox.height * factor,
        }
      : undefined,
    cornerPoints: cornerPoints ? cornerPoints.map((p) => scalePoint(p, factor)) : undefined,
  };
}
