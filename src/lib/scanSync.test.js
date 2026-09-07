import { beforeEach, describe, expect, test, vi } from 'vitest';

// pushScanViaRpc talks to the live Supabase client's .rpc(); stub it so the
// module can load without real credentials and so each test controls what
// .rpc() resolves with.
const rpcMock = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { createQueueItem, pushScanViaRpc } = await import('./scanSync');

beforeEach(() => {
  rpcMock.mockReset();
});

describe('pushScanViaRpc', () => {
  test('calls record_scan with a CP scan mapped to RPC args', async () => {
    // Arrange
    rpcMock.mockResolvedValueOnce({ data: { cps: { a1: 123 } }, error: null });
    const item = { type: 'CP', runnerId: 'runner-1', stationId: 'a1', time: 123, operator: 'สมชาย', isRescan: false };

    // Act
    const result = await pushScanViaRpc(item);

    // Assert
    expect(rpcMock).toHaveBeenCalledWith('record_scan', {
      p_runner_id: 'runner-1',
      p_scan_type: 'CP',
      p_station_id: 'a1',
      p_scan_time: 123,
      p_operator: 'สมชาย',
      p_is_rescan: false,
    });
    expect(result).toEqual({ reason: null, data: { cps: { a1: 123 } } });
  });

  test('passes a rescan through with p_is_rescan true', async () => {
    rpcMock.mockResolvedValueOnce({ data: { finish: 999 }, error: null });
    const item = { type: 'FINISH', runnerId: 'runner-1', time: 999, operator: 'สมชาย', isRescan: true };

    const result = await pushScanViaRpc(item);

    expect(rpcMock).toHaveBeenCalledWith('record_scan', expect.objectContaining({ p_is_rescan: true, p_scan_type: 'FINISH' }));
    expect(result.reason).toBeNull();
  });

  test('maps a CHECKIN item to the matching RPC args, p_station_id null', async () => {
    rpcMock.mockResolvedValueOnce({ data: { registration_status: 'CHECKED_IN' }, error: null });
    const item = { type: 'CHECKIN', runnerId: 'runner-1', time: 456, operator: 'สมชาย', isRescan: false };

    await pushScanViaRpc(item);

    expect(rpcMock).toHaveBeenCalledWith('record_scan', expect.objectContaining({ p_scan_type: 'CHECKIN', p_station_id: null }));
  });

  test('returns a Thai reason and null data when the RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const item = { type: 'CP', runnerId: 'runner-1', stationId: 'a1', time: 1, operator: 'x' };

    const result = await pushScanViaRpc(item);

    expect(result.data).toBeNull();
    expect(result.reason).toBeTruthy();
  });

  test.each([
    ['an unknown type', { type: 'SOMETHING_ELSE', runnerId: 'r1', time: 1 }],
    ['a missing runnerId', { type: 'CP', time: 1 }],
    ['null', null],
    ['undefined', undefined],
  ])('returns a reason for %s without calling the RPC, so the item is never silently dropped', async (_label, item) => {
    const result = await pushScanViaRpc(item);
    expect(result.data).toBeNull();
    expect(result.reason).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('createQueueItem', () => {
  test('carries the scan identity and the type-specific extras', () => {
    const item = createQueueItem(
      'CP',
      { runnerId: 'runner-1', bib: '1001', operator: 'สมชาย' },
      { stationId: 'a1', time: 1 }
    );

    expect(item).toMatchObject({
      type: 'CP',
      runnerId: 'runner-1',
      bib: '1001',
      operator: 'สมชาย',
      stationId: 'a1',
      time: 1,
    });
    expect(item.id).toMatch(/^queue_\d+$/);
  });
});
