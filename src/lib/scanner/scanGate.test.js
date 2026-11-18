import { describe, it, expect } from 'vitest';
import { createScanGate } from './scanGate';

// Reference: the inline logic from HEAD's ScannerInput.jsx camera callback,
// kept verbatim (state in a plain object) so the extracted gate can be diffed against it.
function createLegacyGate() {
  const state = { lastTs: 0, lastScanned: '' };
  return {
    handle({ now, bib, matched }) {
      const timeSinceLast = now - state.lastTs;
      if (timeSinceLast < 750) return null;
      if (!bib) return null;
      if (!matched && bib.length < 1) return null;
      const isSameBib = bib === state.lastScanned;
      const minInterval = isSameBib ? (matched ? 2000 : 1200) : 750;
      if (timeSinceLast < minInterval) return null;
      state.lastTs = now;
      state.lastScanned = bib;
      return { clearDelay: matched ? 2200 : 1200 };
    },
    clear(bib) {
      if (state.lastScanned === bib) state.lastScanned = '';
    },
  };
}

// Adapter: same call order the component uses (throttle first, then accept).
function handleWithGate(gate, { now, bib, matched }) {
  if (gate.isThrottled(now)) return null;
  const verdict = gate.accept({ now, bib, matched });
  return verdict.accepted ? { clearDelay: verdict.clearDelayMs } : null;
}

describe('createScanGate', () => {
  it('accepts the first scan and reports the matched clear delay', () => {
    const gate = createScanGate();
    const verdict = gate.accept({ now: 10_000, bib: '5106', matched: true });
    expect(verdict).toEqual({ accepted: true, clearDelayMs: 2200 });
  });

  it('uses the shorter clear delay for unmatched bibs', () => {
    const gate = createScanGate();
    expect(gate.accept({ now: 10_000, bib: 'X9', matched: false }).clearDelayMs).toBe(1200);
  });

  it('throttles anything within 750 ms of the last accepted scan', () => {
    const gate = createScanGate();
    gate.accept({ now: 10_000, bib: '1', matched: true });
    expect(gate.isThrottled(10_749)).toBe(true);
    expect(gate.isThrottled(10_750)).toBe(false);
  });

  it('rejects the same matched bib until 2000 ms passed, unmatched until 1200 ms', () => {
    const matched = createScanGate();
    matched.accept({ now: 10_000, bib: '1', matched: true });
    expect(matched.accept({ now: 11_999, bib: '1', matched: true }).accepted).toBe(false);
    expect(matched.accept({ now: 12_000, bib: '1', matched: true }).accepted).toBe(true);

    const unmatched = createScanGate();
    unmatched.accept({ now: 10_000, bib: 'Z', matched: false });
    expect(unmatched.accept({ now: 11_199, bib: 'Z', matched: false }).accepted).toBe(false);
    expect(unmatched.accept({ now: 11_200, bib: 'Z', matched: false }).accepted).toBe(true);
  });

  it('accepts a different bib once the 750 ms throttle has passed', () => {
    const gate = createScanGate();
    gate.accept({ now: 10_000, bib: '1', matched: true });
    expect(gate.accept({ now: 10_750, bib: '2', matched: true }).accepted).toBe(true);
  });

  it('rejects an empty bib', () => {
    const gate = createScanGate();
    expect(gate.accept({ now: 10_000, bib: '', matched: false }).accepted).toBe(false);
  });

  it('release(bib) lets the same bib be re-accepted at the 750 ms throttle', () => {
    const gate = createScanGate();
    gate.accept({ now: 10_000, bib: '1', matched: true });
    gate.release('1');
    expect(gate.accept({ now: 10_800, bib: '1', matched: true }).accepted).toBe(true);
  });

  it('release(bib) ignores a bib that is no longer the last one', () => {
    const gate = createScanGate();
    gate.accept({ now: 10_000, bib: '1', matched: true });
    gate.accept({ now: 11_000, bib: '2', matched: true });
    gate.release('1');
    expect(gate.accept({ now: 11_800, bib: '2', matched: true }).accepted).toBe(false);
  });

  it('behaves identically to the legacy inline logic over a pseudo-random scan stream', () => {
    // Arrange: deterministic LCG so the test is reproducible
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const gate = createScanGate();
    const legacy = createLegacyGate();
    const pendingClears = [];
    let now = 100_000;

    for (let i = 0; i < 2000; i += 1) {
      // Act
      now += Math.floor(rand() * 900);
      while (pendingClears.length && pendingClears[0].at <= now) {
        const { bib } = pendingClears.shift();
        gate.release(bib);
        legacy.clear(bib);
      }
      const bib = rand() < 0.1 ? '' : String(Math.floor(rand() * 3));
      const matched = rand() < 0.6;
      const expected = legacy.handle({ now, bib, matched });
      const actual = handleWithGate(gate, { now, bib, matched });

      // Assert
      expect(actual).toEqual(expected);
      if (expected) {
        pendingClears.push({ at: now + expected.clearDelay, bib });
        pendingClears.sort((a, b) => a.at - b.at);
      }
    }
  });
});
