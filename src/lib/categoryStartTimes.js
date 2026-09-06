import { parseStartTime } from '../context/RaceContext';

/**
 * Fetches checkpoint(type=START).cutoff_time per category and returns a
 * lookup keyed by both category name and category id, so callers can match
 * a runner via either `runner.cat` (display string) or the reliable
 * `runner.category_id` FK — mirrors RaceContext.jsx's preloadEventData catMap
 * so every page resolves gun-start time from the same source of truth.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ id: string, name?: string, start_time?: string }>} categories
 * @returns {Promise<Record<string, any>>}
 */
export async function fetchCategoryStartMap(supabase, categories) {
  const loadedCats = categories || [];
  const catIds = loadedCats.map(c => c.id).filter(Boolean);
  if (catIds.length === 0) return {};

  const { data: cpData } = await supabase
    .from('checkpoint')
    .select(`
      id, category_id, station_id, sequence_order, cutoff_time,
      stations ( name, type )
    `)
    .in('category_id', catIds);
  const checkpoints = cpData || [];

  const catMap = {};
  loadedCats.forEach(c => {
    const startCp = checkpoints.find(cp =>
      cp.category_id === c.id && (cp.stations?.type === 'START' || cp.sequence_order === 1) && cp.cutoff_time
    );
    const effectiveStartTime = startCp?.cutoff_time || c.start_time || null;
    const catObj = { ...c, start_time: effectiveStartTime };
    if (c.name) catMap[c.name] = catObj;
    if (c.id) catMap[c.id] = catObj;
  });
  return catMap;
}

/**
 * Stamps gunStartTime (epoch ms) + categoryStartTimeStr (th-TH display
 * string) onto a runner — immutable, returns a new object. Matches via
 * `cat` (display string) with `category_id` as fallback, same as
 * RaceContext.jsx's existing per-runner logic.
 *
 * @param {Record<string, any>} runner
 * @param {Record<string, any>} catMap
 * @returns {Record<string, any>}
 */
export function attachGunStartTime(runner, catMap) {
  const matchedCat = catMap[runner.cat] || (runner.category_id ? catMap[runner.category_id] : null);
  const checkinTime = runner.checkin || (runner.checked_in_at ? new Date(runner.checked_in_at).getTime() : null);
  const gunStartTime = matchedCat?.start_time ? parseStartTime(matchedCat.start_time, checkinTime) : null;
  const categoryStartTimeStr = matchedCat?.start_time
    ? (matchedCat.start_time.includes('T')
        ? new Date(matchedCat.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : matchedCat.start_time)
    : null;
  return { ...runner, gunStartTime, categoryStartTimeStr };
}
