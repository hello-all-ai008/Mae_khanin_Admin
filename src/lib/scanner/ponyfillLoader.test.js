import { describe, it, expect, vi, beforeEach } from 'vitest';

const prepareZXingModule = vi.fn();
const purgeZXingModule = vi.fn();
class FakeDetector {}

vi.mock('barcode-detector/ponyfill', () => ({
  BarcodeDetector: FakeDetector,
  prepareZXingModule: (...args) => prepareZXingModule(...args),
  purgeZXingModule: (...args) => purgeZXingModule(...args),
}));
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/assets/zxing_reader-test.wasm' }));

const freshLoader = async () => {
  vi.resetModules();
  return import('./ponyfillLoader.js');
};

describe('ponyfillLoader', () => {
  beforeEach(() => {
    prepareZXingModule.mockReset();
    purgeZXingModule.mockReset();
  });

  it('prepares the module once and caches a successful load', async () => {
    prepareZXingModule.mockResolvedValue({});
    const { loadPonyfill } = await freshLoader();

    const first = await loadPonyfill();
    const second = await loadPonyfill();

    expect(first.BarcodeDetector).toBe(FakeDetector);
    expect(second).toBe(first);
    expect(prepareZXingModule).toHaveBeenCalledTimes(1);
    expect(purgeZXingModule).not.toHaveBeenCalled();
  });

  it('locates the wasm through the self-hosted asset url', async () => {
    prepareZXingModule.mockResolvedValue({});
    const { loadPonyfill } = await freshLoader();

    await loadPonyfill();

    const { overrides, fireImmediately } = prepareZXingModule.mock.calls[0][0];
    expect(fireImmediately).toBe(true);
    expect(overrides.locateFile('zxing_reader.wasm', 'prefix/')).toBe('/assets/zxing_reader-test.wasm');
    expect(overrides.locateFile('other.js', 'prefix/')).toBe('prefix/other.js');
  });

  it('purges and clears the cache on failure so the next call retries', async () => {
    prepareZXingModule.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({});
    const { loadPonyfill } = await freshLoader();

    await expect(loadPonyfill()).rejects.toThrow('network');
    const retry = await loadPonyfill();

    expect(purgeZXingModule).toHaveBeenCalledTimes(1);
    expect(prepareZXingModule).toHaveBeenCalledTimes(2);
    expect(retry.BarcodeDetector).toBe(FakeDetector);
  });

  it('resetPonyfill purges the module and forces a fresh load', async () => {
    prepareZXingModule.mockResolvedValue({});
    const { loadPonyfill, resetPonyfill } = await freshLoader();
    await loadPonyfill();

    resetPonyfill();
    await loadPonyfill();

    expect(purgeZXingModule).toHaveBeenCalledTimes(1);
    expect(prepareZXingModule).toHaveBeenCalledTimes(2);
  });
});
