import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadPonyfillImpl = vi.fn();
const resetPonyfillImpl = vi.fn();

vi.mock('./ponyfillLoader.js', () => ({
  loadPonyfill: (...args) => loadPonyfillImpl(...args),
  resetPonyfill: (...args) => resetPonyfillImpl(...args),
}));

const freshDetector = async () => {
  vi.resetModules();
  return import('./detector.js');
};

describe('detector defaultLoadPonyfill cache', () => {
  beforeEach(() => {
    loadPonyfillImpl.mockReset();
    resetPonyfillImpl.mockReset();
  });

  it('shares one load between concurrent callers and caches success', async () => {
    loadPonyfillImpl.mockResolvedValue({ BarcodeDetector: class {} });
    const { defaultLoadPonyfill } = await freshDetector();

    const [a, b] = await Promise.all([defaultLoadPonyfill(), defaultLoadPonyfill()]);
    await defaultLoadPonyfill();

    expect(a).toBe(b);
    expect(loadPonyfillImpl).toHaveBeenCalledTimes(1);
  });

  it('clears the cache on failure so a retry loads again', async () => {
    loadPonyfillImpl.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ BarcodeDetector: class {} });
    const { defaultLoadPonyfill } = await freshDetector();

    await expect(defaultLoadPonyfill()).rejects.toThrow('offline');
    await expect(defaultLoadPonyfill()).resolves.toBeDefined();

    expect(loadPonyfillImpl).toHaveBeenCalledTimes(2);
  });

  it('resetPonyfill clears the cache and resets the loader module', async () => {
    loadPonyfillImpl.mockResolvedValue({ BarcodeDetector: class {} });
    const { defaultLoadPonyfill, resetPonyfill } = await freshDetector();
    await defaultLoadPonyfill();

    await resetPonyfill();
    await defaultLoadPonyfill();

    expect(resetPonyfillImpl).toHaveBeenCalledTimes(1);
    expect(loadPonyfillImpl).toHaveBeenCalledTimes(2);
  });
});
