import { describe, it, expect, vi } from 'vitest';
import {
  DETECTOR_FORMATS,
  isOneDimensional,
  createDetector,
  scaleDetection,
  warmUpDetector,
} from './detector';

const makeNative = (supported) => {
  const instances = [];
  class NativeDetector {
    constructor(opts) {
      this.opts = opts;
      instances.push(this);
    }
    static getSupportedFormats() {
      return Promise.resolve(supported);
    }
    detect() {
      return Promise.resolve([]);
    }
  }
  return { NativeDetector, instances };
};

const makePonyfillLoader = () => {
  class PonyDetector {
    constructor(opts) {
      this.opts = opts;
    }
    detect() {
      return Promise.resolve([]);
    }
  }
  return { loader: vi.fn(() => Promise.resolve({ BarcodeDetector: PonyDetector })), PonyDetector };
};

describe('DETECTOR_FORMATS', () => {
  it('excludes noisy formats itf, codabar and code_93', () => {
    expect(DETECTOR_FORMATS).not.toContain('itf');
    expect(DETECTOR_FORMATS).not.toContain('codabar');
    expect(DETECTOR_FORMATS).not.toContain('code_93');
    expect(DETECTOR_FORMATS).toContain('qr_code');
    expect(DETECTOR_FORMATS).toContain('code_128');
  });
});

describe('isOneDimensional', () => {
  it('flags linear formats and not matrix formats', () => {
    expect(isOneDimensional('code_128')).toBe(true);
    expect(isOneDimensional('ean_13')).toBe(true);
    expect(isOneDimensional('qr_code')).toBe(false);
    expect(isOneDimensional('pdf417')).toBe(false);
  });
});

describe('createDetector', () => {
  it('chooses the native detector when it supports qr_code and code_128', async () => {
    const { NativeDetector, instances } = makeNative(['qr_code', 'code_128', 'ean_13', 'itf']);
    const { loader } = makePonyfillLoader();

    const result = await createDetector({ nativeCtor: NativeDetector, loadPonyfill: loader });

    expect(result.kind).toBe('native');
    expect(loader).not.toHaveBeenCalled();
    expect(instances[0].opts.formats).toEqual(['qr_code', 'code_128', 'ean_13']);
  });

  it('uses the ponyfill when BarcodeDetector is missing', async () => {
    const { loader, PonyDetector } = makePonyfillLoader();

    const result = await createDetector({ nativeCtor: undefined, loadPonyfill: loader });

    expect(result.kind).toBe('ponyfill');
    expect(result.detector).toBeInstanceOf(PonyDetector);
    expect(result.detector.opts.formats).toEqual(DETECTOR_FORMATS);
  });

  it('uses the ponyfill when native lacks qr_code or code_128', async () => {
    const { NativeDetector } = makeNative(['qr_code', 'ean_13']);
    const { loader } = makePonyfillLoader();

    const result = await createDetector({ nativeCtor: NativeDetector, loadPonyfill: loader });

    expect(result.kind).toBe('ponyfill');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('falls back to the ponyfill when getSupportedFormats rejects', async () => {
    class Broken {
      static getSupportedFormats() {
        return Promise.reject(new Error('boom'));
      }
    }
    const { loader } = makePonyfillLoader();

    const result = await createDetector({ nativeCtor: Broken, loadPonyfill: loader });

    expect(result.kind).toBe('ponyfill');
  });

  it('propagates a ponyfill load failure', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('wasm failed')));

    await expect(createDetector({ nativeCtor: undefined, loadPonyfill: loader })).rejects.toThrow('wasm failed');
  });
});

describe('scaleDetection', () => {
  it('scales cornerPoints and boundingBox back to video pixels', () => {
    const detection = {
      rawValue: 'x',
      format: 'qr_code',
      boundingBox: { x: 10, y: 20, width: 30, height: 40 },
      cornerPoints: [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 10, y: 60 }],
    };

    const scaled = scaleDetection(detection, 1.5);

    expect(scaled.boundingBox).toEqual({ x: 15, y: 30, width: 45, height: 60 });
    expect(scaled.cornerPoints[1]).toEqual({ x: 60, y: 30 });
    expect(detection.cornerPoints[1]).toEqual({ x: 40, y: 20 });
    expect(scaled.rawValue).toBe('x');
  });
});

describe('warmUpDetector', () => {
  it('does not load the ponyfill when native is sufficient', async () => {
    const { NativeDetector } = makeNative(['qr_code', 'code_128']);
    const { loader } = makePonyfillLoader();

    await warmUpDetector({ nativeCtor: NativeDetector, loadPonyfill: loader });

    expect(loader).not.toHaveBeenCalled();
  });

  it('loads the ponyfill in the background when native is missing', async () => {
    const { loader } = makePonyfillLoader();

    await warmUpDetector({ nativeCtor: undefined, loadPonyfill: loader });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('swallows a load failure so a later open can retry', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('offline')));

    await expect(warmUpDetector({ nativeCtor: undefined, loadPonyfill: loader })).resolves.toBeUndefined();
  });
});
