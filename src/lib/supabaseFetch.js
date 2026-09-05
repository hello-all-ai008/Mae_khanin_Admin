// Helper for fetching every row a Supabase query matches, bypassing
// PostgREST's default per-request row cap (Supabase's hosted "Max Rows"
// setting — 1000 by default). A plain `.select('*')` silently truncates
// once a table passes that cap, with no error — the caller just gets back
// fewer rows than actually exist. Use this whenever a page must show every
// matching row (a full runner list, a bulk export), not just a preview.

const DEFAULT_PAGE_SIZE = 1000;
// Safety net, not a real-world limit: stops a misconfigured caller (e.g. a
// `.range()` that got dropped, or a filter that never narrows) from paging
// forever instead of hanging the tab. Real tables should terminate long
// before this via the short-page check below.
const DEFAULT_MAX_ROWS = 200_000;

/**
 * Pages through a query via `.range()` until a page comes back shorter than
 * `pageSize`, which means there is nothing left to fetch.
 * @param {(from: number, to: number) => Promise<{ data: unknown[] | null, error: unknown }>} buildPage
 *   Called with a zero-based inclusive `[from, to]` range. Must build and
 *   await a fresh `.range(from, to)`-scoped, deterministically **ordered**
 *   query each call — a supabase-js query builder can't be reused after
 *   it's been awaited, and `LIMIT`/`OFFSET` without `ORDER BY` has no
 *   guaranteed row order between calls, which can duplicate or skip rows
 *   across pages.
 * @param {{ pageSize?: number, maxRows?: number }} [options]
 * @returns {Promise<{ data: unknown[], error: unknown }>} `error` is set on
 *   the first failed page, or once `maxRows` is exceeded; `data` holds
 *   whatever pages succeeded before that.
 */
export async function fetchAllRows(buildPage, { pageSize = DEFAULT_PAGE_SIZE, maxRows = DEFAULT_MAX_ROWS } = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildPage(offset, offset + pageSize - 1);
    if (error) return { data: rows, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
    if (rows.length >= maxRows) {
      return { data: rows, error: new Error(`fetchAllRows: exceeded maxRows (${maxRows}) — stopped paging`) };
    }
    offset += pageSize;
  }
}
