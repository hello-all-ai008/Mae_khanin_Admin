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
      stations ( id, name, type )
    `)
    .in('category_id', catIds);
  const checkpoints = cpData || [];

  const catMap = {};
  loadedCats.forEach(c => {
    // Checkpoints belonging to this category, ordered by sequence
    const catCheckpoints = checkpoints
      .filter(cp => cp.category_id === c.id)
      .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));

    // Extract CP stations (excluding START and FINISH)
    const catStations = catCheckpoints
      .map(cp => {
        const st = Array.isArray(cp.stations) ? cp.stations[0] : cp.stations;
        return {
          id: cp.station_id || st?.id,
          name: st?.name || `Checkpoint ${cp.sequence_order}`,
          type: st?.type || 'CP',
          sequence_order: cp.sequence_order,
          cutoff_time: cp.cutoff_time
        };
      })
      .filter(st => st.type !== 'START' && st.type !== 'FINISH' && !/start|ปล่อยตัว|finish|เส้นชัย/i.test(st.name || ''));

    const startCp = checkpoints.find(cp => {
      const st = Array.isArray(cp.stations) ? cp.stations[0] : cp.stations;
      return cp.category_id === c.id && (st?.type === 'START' || /start|ปล่อยตัว/i.test(st?.name || '') || cp.sequence_order === 1) && cp.cutoff_time;
    });
    const effectiveStartTime = startCp?.cutoff_time || c.start_time || null;
    const catObj = { ...c, start_time: effectiveStartTime, stations: catStations, checkpoints: catCheckpoints };
    if (c.name) catMap[c.name] = catObj;
    if (c.id) catMap[c.id] = catObj;
    if (c.code) catMap[c.code] = catObj;
    if (c.distance != null) {
      catMap[String(c.distance)] = catObj;
      if (c.unit) catMap[`${c.distance}${c.unit}`] = catObj;
    }
  });
  return catMap;
}

/**
 * Stamps gunStartTime (epoch ms) + categoryStartTimeStr (th-TH display
 * string) onto a runner — immutable, returns a new object. Matches via
 * `cat`, `cat_name`, `distance` with `category_id` as fallback.
 *
 * @param {Record<string, any>} runner
 * @param {Record<string, any>} catMap
 * @returns {Record<string, any>}
 */
export function attachGunStartTime(runner, catMap) {
  const catKey = runner.cat || runner.cat_name || runner.distance || (runner.distance && runner.unit ? `${runner.distance}${runner.unit}` : null);
  const matchedCat = (catKey ? catMap[catKey] : null) || (runner.category_id ? catMap[runner.category_id] : null);
  
  const gunStartTime = matchedCat?.start_time ? parseStartTime(matchedCat.start_time, null) : null;
  const categoryStartTimeStr = matchedCat?.start_time
    ? (matchedCat.start_time.includes('T')
        ? new Date(matchedCat.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : matchedCat.start_time)
    : null;
  return { 
    ...runner, 
    gunStartTime: gunStartTime || runner.gun_start_time || runner.start_time || null, 
    categoryStartTimeStr,
    categoryStations: matchedCat?.stations || [],
    categoryCheckpoints: matchedCat?.checkpoints || []
  };
}
