import { describe, it, expect } from 'vitest';
import { normalizeZoom } from './camera';

describe('normalizeZoom', () => {
  it('rounds to the nearest step from min', () => {
    expect(normalizeZoom(2.04, { min: 1, max: 5, step: 0.1 })).toBeCloseTo(2.0, 5);
    expect(normalizeZoom(2.07, { min: 1, max: 5, step: 0.1 })).toBeCloseTo(2.1, 5);
  });

  it('clamps to [min, max]', () => {
    expect(normalizeZoom(0.2, { min: 1, max: 5, step: 0.5 })).toBe(1);
    expect(normalizeZoom(9, { min: 1, max: 5, step: 0.5 })).toBe(5);
  });

  it('skips rounding when step is missing or zero', () => {
    expect(normalizeZoom(2.345, { min: 1, max: 5 })).toBe(2.345);
    expect(normalizeZoom(2.345, { min: 1, max: 5, step: 0 })).toBe(2.345);
  });
});
