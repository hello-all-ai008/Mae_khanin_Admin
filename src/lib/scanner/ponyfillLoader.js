// Loaded only through a dynamic import (see detector.js defaultLoadPonyfill).
// The reader wasm is emitted into dist by Vite via ?url, so it is self-hosted
// and always version-matched with the installed zxing-wasm. No CDN is used.
import { BarcodeDetector, prepareZXingModule, purgeZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const locateFile = (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path);

let loadPromise = null;

async function load() {
  // fireImmediately fetches + compiles the wasm now so a failure surfaces here
  // instead of on the first frame.
  await prepareZXingModule({ overrides: { locateFile }, fireImmediately: true });
  return { BarcodeDetector };
}

/** Drops a broken decoder (wasm abort / OOM): purge the module and the cached load. */
export function resetPonyfill() {
  purgeZXingModule();
  loadPromise = null;
}

/** Idempotent and shared (warm-up + camera open). A failure clears the cache. */
export function loadPonyfill() {
  if (!loadPromise) {
    loadPromise = load().catch((err) => {
      // barcode-detector caches the module promise, rejected ones included;
      // purge it so the next attempt really refetches the wasm.
      purgeZXingModule();
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}
