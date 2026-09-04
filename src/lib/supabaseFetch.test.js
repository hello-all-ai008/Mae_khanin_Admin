import { describe, expect, test, vi } from 'vitest';
import { fetchAllRows } from './supabaseFetch';

function pagesOf(pages) {
  const calls = [];
  const buildPage = vi.fn((from, to) => {
    calls.push([from, to]);
    const page = pages.shift() || [];
    return Promise.resolve({ data: page, error: null });
  });
  return { buildPage, calls };
}

describe('fetchAllRows', () => {
  test('returns everything in one page when the table is under pageSize', async () => {
    const { buildPage, calls } = pagesOf([[{ id: 1 }, { id: 2 }]]);

    const { data, error } = await fetchAllRows(buildPage, { pageSize: 3 });

    expect(error).toBeNull();
    expect(data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls).toEqual([[0, 2]]);
  });

  test('pages past the cap and concatenates every batch in order', async () => {
    const full = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const partial = [{ id: 3 }];
    const { buildPage, calls } = pagesOf([full, partial]);

    const { data, error } = await fetchAllRows(buildPage, { pageSize: 3 });

    expect(error).toBeNull();
    expect(data).toEqual([...full, ...partial]);
    expect(calls).toEqual([
      [0, 2],
      [3, 5],
    ]);
  });

  test('stops immediately and reports the error on a failed page, keeping prior rows', async () => {
    const first = [{ id: 1 }, { id: 2 }];
    const buildPage = vi
      .fn()
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'network error' } });

    const { data, error } = await fetchAllRows(buildPage, { pageSize: 2 });

    expect(error).toEqual({ message: 'network error' });
    expect(data).toEqual(first);
    expect(buildPage).toHaveBeenCalledTimes(2);
  });

  test('treats a null data page as empty and stops', async () => {
    const buildPage = vi.fn().mockResolvedValueOnce({ data: null, error: null });

    const { data, error } = await fetchAllRows(buildPage, { pageSize: 5 });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('defaults pageSize to 1000 when not provided', async () => {
    const buildPage = vi.fn((from, to) => {
      expect(to - from + 1).toBe(1000);
      return Promise.resolve({ data: [], error: null });
    });

    await fetchAllRows(buildPage);

    expect(buildPage).toHaveBeenCalledTimes(1);
  });

  test('stops with an error instead of paging forever past maxRows', async () => {
    // A misbehaving caller that never returns a short page (e.g. a dropped
    // filter) must not hang — maxRows should cut it off deterministically.
    const buildPage = vi.fn(() => Promise.resolve({ data: [{ id: 1 }, { id: 2 }], error: null }));

    const { data, error } = await fetchAllRows(buildPage, { pageSize: 2, maxRows: 4 });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/maxRows/);
    expect(data).toHaveLength(4);
    expect(buildPage).toHaveBeenCalledTimes(2);
  });
});
