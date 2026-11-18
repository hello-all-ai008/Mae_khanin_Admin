import { describe, it, expect } from 'vitest';
import { createScanConfirmer, pickBestDetection } from './confirm';

const box = (x, y, width, height) => ({ x, y, width, height });
const det = (rawValue, format, boundingBox = box(0, 0, 10, 10)) => ({ rawValue, format, boundingBox });

describe('createScanConfirmer', () => {
  it('does not confirm a 1D barcode on first sight', () => {
    // Arrange
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    // Act
    const result = confirmer.push(det('5106', 'code_128'));
    // Assert
    expect(result).toBeNull();
  });

  it('confirms a 1D barcode after two consecutive equal reads', () => {
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    confirmer.push(det('5106', 'code_128'));
    t += 100;
    const result = confirmer.push(det('5106', 'code_128'));
    expect(result?.rawValue).toBe('5106');
  });

  it('resets 1D confirmation when the value changes between reads', () => {
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    confirmer.push(det('5106', 'code_128'));
    t += 100;
    const second = confirmer.push(det('5107', 'code_128'));
    t += 100;
    const third = confirmer.push(det('5106', 'code_128'));
    expect(second).toBeNull();
    expect(third).toBeNull();
  });

  it('resets 1D confirmation when the first read is stale (over 500 ms)', () => {
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    confirmer.push(det('5106', 'ean_13'));
    t += 501;
    const result = confirmer.push(det('5106', 'ean_13'));
    expect(result).toBeNull();
  });

  it('confirms a 1D barcode when the second read arrives at exactly 500 ms', () => {
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    confirmer.push(det('5106', 'code_128'));
    t += 500;
    const result = confirmer.push(det('5106', 'code_128'));
    expect(result?.rawValue).toBe('5106');
  });

  it('confirms a 2D code immediately while a 1D read is pending, without disturbing the 1D read', () => {
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    confirmer.push(det('1D-VALUE', 'code_128'));
    t += 50;
    const twoD = confirmer.push(det('QR-VALUE', 'qr_code'));
    t += 50;
    const oneD = confirmer.push(det('1D-VALUE', 'code_128'));
    expect(twoD?.rawValue).toBe('QR-VALUE');
    expect(oneD?.rawValue).toBe('1D-VALUE');
  });

  it('needs a fresh pair after a 1D value was confirmed', () => {
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    confirmer.push(det('5106', 'code_39'));
    t += 100;
    confirmer.push(det('5106', 'code_39'));
    t += 100;
    const result = confirmer.push(det('5106', 'code_39'));
    expect(result).toBeNull();
  });

  it.each(['qr_code', 'data_matrix', 'pdf417'])('confirms 2D format %s immediately', (format) => {
    const confirmer = createScanConfirmer({ now: () => 1000 });
    const result = confirmer.push(det('5106', format));
    expect(result?.rawValue).toBe('5106');
  });

  it('returns null when pushed null or an empty rawValue', () => {
    const confirmer = createScanConfirmer({ now: () => 1000 });
    expect(confirmer.push(null)).toBeNull();
    expect(confirmer.push(det('', 'qr_code'))).toBeNull();
  });

  it('reset() discards a pending 1D read', () => {
    let t = 1000;
    const confirmer = createScanConfirmer({ now: () => t });
    confirmer.push(det('5106', 'code_128'));
    confirmer.reset();
    t += 100;
    expect(confirmer.push(det('5106', 'code_128'))).toBeNull();
  });
});

describe('pickBestDetection', () => {
  it('returns null for empty or missing input', () => {
    expect(pickBestDetection([], 1920, 1080)).toBeNull();
    expect(pickBestDetection(undefined, 1920, 1080)).toBeNull();
  });

  it('picks the detection with the largest bounding-box area', () => {
    const small = det('small', 'qr_code', box(0, 0, 50, 50));
    const large = det('large', 'qr_code', box(900, 500, 200, 200));
    expect(pickBestDetection([small, large], 1920, 1080)).toBe(large);
  });

  it('breaks an area tie by distance to the frame center', () => {
    const far = det('far', 'qr_code', box(0, 0, 100, 100));
    const near = det('near', 'qr_code', box(910, 490, 100, 100));
    expect(pickBestDetection([far, near], 1920, 1080)).toBe(near);
  });

  it('falls back to cornerPoints when boundingBox is missing', () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const withCorners = { rawValue: 'c', format: 'qr_code', cornerPoints: corners };
    const tiny = det('tiny', 'qr_code', box(0, 0, 5, 5));
    expect(pickBestDetection([tiny, withCorners], 1920, 1080)).toBe(withCorners);
  });
});
