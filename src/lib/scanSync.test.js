import { describe, expect, test, vi } from 'vitest';

// scanSync imports the live Supabase client at module load, and that module
// throws when the env vars are absent. Only the pure patch builder is under
// test here, so the client is stubbed out rather than configured.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

const { createQueueItem, patchForQueuedScan } = await import('./scanSync');

// pushScanUpdate / pushQueuedScan are not tested here: they exist only to talk
// to Supabase, and a version of them with the client mocked would assert
// nothing but the shape of the mock.

describe('patchForQueuedScan', () => {
  test('turns a CHECKIN into the check-in columns', () => {
    // Arrange
    const time = Date.parse('2026-08-30T01:23:45.000Z');
    const item = { type: 'CHECKIN', time, operator: 'สมชาย' };

    // Act
    const patch = patchForQueuedScan(item);

    // Assert
    expect(patch).toEqual({
      registration_status: 'CHECKED_IN',
      checked_in_at: '2026-08-30T01:23:45.000Z',
      checked_in_by: 'สมชาย',
    });
  });

  test('turns a CP into the checkpoint map, unchanged', () => {
    const cps = { 'station-a1': 1756500000000 };

    const patch = patchForQueuedScan({ type: 'CP', cps, stationId: 'station-a1' });

    expect(patch).toEqual({ cps });
    // The map must be passed straight through: a copy that drops earlier
    // checkpoints would erase a runner's history on sync.
    expect(patch.cps).toBe(cps);
  });

  test('turns a FINISH into the finish timestamp', () => {
    const time = 1756500000000;

    expect(patchForQueuedScan({ type: 'FINISH', time })).toEqual({ finish: time });
  });

  test.each([
    ['an unknown type', { type: 'SOMETHING_ELSE' }],
    ['a missing type', { runnerId: 'r1' }],
    ['null', null],
    ['undefined', undefined],
  ])('returns null for %s, so the item is never silently dropped', (_label, item) => {
    expect(patchForQueuedScan(item)).toBeNull();
  });
});

describe('createQueueItem', () => {
  test('carries the scan identity and the type-specific extras', () => {
    const item = createQueueItem(
      'CP',
      { runnerId: 'runner-1', bib: '1001', operator: 'สมชาย' },
      { cps: { a1: 1 }, stationId: 'a1' }
    );

    expect(item).toMatchObject({
      type: 'CP',
      runnerId: 'runner-1',
      bib: '1001',
      operator: 'สมชาย',
      cps: { a1: 1 },
      stationId: 'a1',
    });
    expect(item.id).toMatch(/^queue_\d+$/);
  });

  test('builds an item every scan type can be patched from', () => {
    const scan = { runnerId: 'runner-1', bib: '1001', operator: 'สมชาย' };

    expect(patchForQueuedScan(createQueueItem('CHECKIN', scan, { time: 1756500000000 }))).not.toBeNull();
    expect(patchForQueuedScan(createQueueItem('CP', scan, { cps: {} }))).not.toBeNull();
    expect(patchForQueuedScan(createQueueItem('FINISH', scan, { time: 1756500000000 }))).not.toBeNull();
  });
});
