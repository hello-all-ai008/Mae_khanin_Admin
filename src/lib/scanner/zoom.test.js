import { describe, it, expect } from 'vitest';
import { INITIAL_ZOOM_VIEW, resolveZoomOutcome, startZoomView } from './zoom';

describe('resolveZoomOutcome', () => {
  it('uses hardware zoom as-is when it was applied, with no CSS scale', () => {
    const view = resolveZoomOutcome({ requested: 2, applied: 2, hardwareCurrent: 1 });
    expect(view).toEqual({ displayZoom: 2, hardwareZoom: 2, cssZoom: 1, hasHardwareZoom: true });
  });

  it('tracks the step-rounded hardware level while keeping the requested display level', () => {
    const view = resolveZoomOutcome({ requested: 2.04, applied: 2.0, hardwareCurrent: 1 });
    expect(view.hardwareZoom).toBe(2.0);
    expect(view.displayZoom).toBe(2.04);
    expect(view.cssZoom).toBe(1);
  });

  it('covers the difference with CSS when hardware fails above the current level', () => {
    const view = resolveZoomOutcome({ requested: 3, applied: null, hardwareCurrent: 1.5 });
    expect(view).toEqual({ displayZoom: 3, hardwareZoom: 1.5, cssZoom: 2, hasHardwareZoom: false });
  });

  it('reports the real level when hardware fails below the current level', () => {
    const view = resolveZoomOutcome({ requested: 1, applied: null, hardwareCurrent: 1.5 });
    expect(view).toEqual({ displayZoom: 1.5, hardwareZoom: 1.5, cssZoom: 1, hasHardwareZoom: false });
  });

  it('uses plain CSS zoom when there is no hardware zoom at all', () => {
    const view = resolveZoomOutcome({ requested: 2.5, applied: null, hardwareCurrent: 1 });
    expect(view.cssZoom).toBe(2.5);
    expect(view.displayZoom).toBe(2.5);
  });
});

describe('startZoomView', () => {
  it('starts at hardware 1x and shows the remembered zoom through CSS until it is re-applied', () => {
    expect(startZoomView({ displayZoom: 2, hasRange: false })).toEqual({
      displayZoom: 2, hardwareZoom: 1, cssZoom: 2, hasHardwareZoom: false,
    });
    expect(startZoomView({ displayZoom: 2, hasRange: true }).cssZoom).toBe(1);
  });

  it('exposes a neutral initial view', () => {
    expect(INITIAL_ZOOM_VIEW.cssZoom).toBe(1);
  });
});
