import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchAllRows } from '../lib/supabaseFetch';
import { useRace } from '../context/RaceContext';
import { RefreshCw, Trophy, ArrowLeft, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ESlipModal from '../components/ESlipModal';
import { computeRunnerRanks, formatEnglishLabel } from '../components/ESlip';
import { fetchCategoryStartMap, attachGunStartTime } from '../lib/categoryStartTimes';

export default function LiveLeaderboard() {
  const { addToast } = useRace();
  const navigate = useNavigate();
  // addToast comes from RaceContext and gets a new identity on every context
  // render — read it via ref so fetchData's own identity stays stable and
  // doesn't re-trigger the fetch/realtime-resubscribe effects below.
  const addToastRef = useRef(addToast);
  useEffect(() => {
    addToastRef.current = addToast;
  });
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  
  const [runners, setRunners] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [distances, setDistances] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedDistance, setSelectedDistance] = useState('ALL');
  const [selectedSlip, setSelectedSlip] = useState(null);
  // Read inside fetchData without making fetchData's identity depend on
  // selectedDistance — a tab click must filter client-side only, never
  // trigger a network re-fetch or a realtime channel re-subscribe.
  const selectedDistanceRef = useRef(selectedDistance);
  useEffect(() => {
    selectedDistanceRef.current = selectedDistance;
  }, [selectedDistance]);

  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase.from('events').select('id, name').order('start_date', { ascending: false });
      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
    }
    fetchEvents();
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!selectedEventId) return;
    if (!silent) setLoading(true);
    try {
      const { data: stData, error: stError } = await supabase
        .from('stations')
        .select('*')
        .eq('event_id', selectedEventId);
      if (stError) throw stError;
      setStations(stData || []);

      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('event_id', selectedEventId);
      if (catError) console.warn('Categories fetch error', catError);
      setCategories(catData || []);

      const catStartMap = await fetchCategoryStartMap(supabase, catData || []);

      const { data: runData, error: runError } = await fetchAllRows((from, to) =>
        supabase
          .from('runners')
          .select('*')
          .eq('event_id', selectedEventId)
          .order('id', { ascending: true })
          .range(from, to)
      );
      if (runError) throw runError;
      
      let actualRunners = (runData || [])
        .filter(r => r.bib !== 'RUNNER_CONFIG' && !String(r.bib || '').startsWith('__'))
        .map(r => {
        const cat = r.cat || r.cat_name || (r.distance != null && r.unit ? `${r.distance}${r.unit}` : (r.distance != null ? String(r.distance) : ''));
        const runnerWithCat = { ...r, cat };
        return attachGunStartTime(runnerWithCat, catStartMap);
      });
      setRunners(actualRunners);

      // Extract unique distances
      const uniqueDist = [...new Set(actualRunners.map(r => r.cat).filter(Boolean))].sort();
      setDistances(uniqueDist);
      if (selectedDistanceRef.current !== 'ALL' && !uniqueDist.includes(selectedDistanceRef.current)) {
        setSelectedDistance('ALL');
      }

    } catch (err) {
      console.error('Fetch leaderboard error:', err);
      addToastRef.current(`ดึงข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live update: any CP/finish scan writes to public.runners (from any
  // station device). Re-pull silently instead of forcing a manual refresh.
  // Debounced so a burst of scans coalesces into one re-fetch.
  useEffect(() => {
    if (!selectedEventId) return undefined;
    let debounceTimer = null;
    const scheduleRefetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchData(true), 400);
    };
    // INSERT/UPDATE only: DELETE isn't tracked reliably without
    // REPLICA IDENTITY FULL on runners, and CP/finish scans are always
    // UPDATEs anyway — a deleted (DQ'd) runner just needs a manual refresh.
    const channel = supabase
      .channel(`runners-live-leaderboard-${selectedEventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'runners', filter: `event_id=eq.${selectedEventId}` },
        scheduleRefetch
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'runners', filter: `event_id=eq.${selectedEventId}` },
        scheduleRefetch
      )
      .subscribe((status, err) => {
        if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime subscribe error (leaderboard):', status, err);
        }
      });

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [selectedEventId, fetchData]);

function isMale(gender) {
  if (!gender) return false;
  const g = String(gender).trim().toLowerCase();
  return g === 'm' || g === 'male' || g.startsWith('ชาย') || g === 'man';
}

function isFemale(gender) {
  if (!gender) return false;
  const g = String(gender).trim().toLowerCase();
  return g === 'f' || g === 'female' || g.startsWith('หญิง') || g === 'woman';
}

function parseTimeToEpoch(timeVal, refTimestamp) {
  if (timeVal == null || timeVal === '') return null;
  if (typeof timeVal === 'number') {
    return isNaN(timeVal) ? null : timeVal;
  }
  const s = String(timeVal).trim();
  if (!s) return null;

  // Numeric epoch string (10 to 13 digits)
  if (/^\d{10,13}$/.test(s)) {
    const num = Number(s);
    return isNaN(num) ? null : num;
  }

  // Full ISO string or date with '-' or '/'
  if (s.includes('-') || s.includes('/')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Time of day "HH:mm:ss" or "HH:mm"
  const parts = s.split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const baseDate = refTimestamp ? new Date(refTimestamp) : new Date();
    baseDate.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
    let epoch = baseDate.getTime();
    if (refTimestamp && epoch > refTimestamp) {
      baseDate.setDate(baseDate.getDate() - 1);
      epoch = baseDate.getTime();
    }
    return epoch;
  }

  return null;
}

function getRunnerStartEpoch(r, finishEpoch, stations = [], categories = []) {
  if (!r) return null;

  // 1. Explicit start fields
  const candidates = [
    r.gunStartTime,
    r.gun_start_time,
    r.start_time,
    r.startTime,
    r.start
  ];
  for (const c of candidates) {
    if (c != null && c !== '') {
      const ep = parseTimeToEpoch(c, finishEpoch);
      if (ep != null) return ep;
    }
  }

  // 2. Check in cps for START station
  if (r.cps && typeof r.cps === 'object') {
    const startStationIds = new Set(
      stations
        .filter(s => s.type === 'START' || /start|ปล่อยตัว/i.test(s.name || ''))
        .map(s => s.id)
    );
    for (const [key, val] of Object.entries(r.cps)) {
      if (startStationIds.has(key) || /start|ปล่อยตัว/i.test(String(key))) {
        const ep = parseTimeToEpoch(val, finishEpoch);
        if (ep != null) return ep;
      }
    }
  }

  // 3. Category start_time
  if (categories && categories.length > 0) {
    const catKey = r.cat || r.cat_name || r.distance || (r.distance && r.unit ? `${r.distance}${r.unit}` : null);
    const matchedCat = categories.find(c => 
      (catKey && (c.name === catKey || c.code === catKey || String(c.distance) === catKey || `${c.distance}${c.unit}` === catKey)) ||
      (r.category_id && c.id === r.category_id)
    );
    if (matchedCat?.start_time) {
      const ep = parseTimeToEpoch(matchedCat.start_time, finishEpoch);
      if (ep != null) return ep;
    }
  }

  // NOTE: Check-in is pre-race registration, NEVER race start!

  // 4. Earliest checkpoint scan before finish (proxy start when no
  //    explicit start time is known — e.g. runner started but the gun/CP1
  //    start scan was never recorded, only a later checkpoint was)
  if (r.cps && typeof r.cps === 'object') {
    const cpTimes = Object.values(r.cps)
      .map(v => parseTimeToEpoch(v, finishEpoch))
      .filter(t => t != null && (!finishEpoch || t < finishEpoch));
    if (cpTimes.length > 0) {
      return Math.min(...cpTimes);
    }
  }

  return null;
}

// Extracts the minimum age from a Thai/English age-group label so groups can
// sort youngest-first (plain string sort misorders labels like "ไม่เกิน 29 ปี").
function parseAgeGroupMin(label) {
  if (!label) return Infinity;
  if (/ไม่เกิน|and under/i.test(label)) return 0;
  const match = label.match(/\d+/);
  return match ? parseInt(match[0], 10) : Infinity;
}

  // Group and rank runners
  const { overallLeaders, leaderboards } = useMemo(() => {
    if (!runners.length) return { overallLeaders: [], leaderboards: [] };
    
    // 1. Process all finished runners (exclude DNS and DNF)
    const allFinishedRunners = runners.filter(r => r.finish && r.race_status !== 'DNS' && r.race_status !== 'DNF');

    const allFinishedWithTimes = allFinishedRunners.map(r => {
      const finishEpoch = parseTimeToEpoch(r.finish);
      const startEpoch = getRunnerStartEpoch(r, finishEpoch, stations, categories);

      let netTimeMs = null;
      if (finishEpoch && startEpoch && finishEpoch > startEpoch) {
        netTimeMs = finishEpoch - startEpoch; // Elapsed Net time (finish - start)
      }

      return { 
        ...r, 
        finishEpoch, 
        startEpoch, 
        netTimeMs,
        sortTime: netTimeMs != null ? netTimeMs : (finishEpoch || Infinity)
      };
    });

    // 2. Compute 1st Male and 1st Female for each distance (Regardless of age group)
    // Overall ranking only applies to 10KM; 5KM has no Overall Champion card and its
    // top finishers are ranked normally within their age group instead.
    const uniqueDistances = [...new Set(allFinishedWithTimes.map(r => r.cat).filter(Boolean))]
      .filter(catName => !/5\s*KM/i.test(catName))
      .sort();
    const overallLeadersAll = [];
    const overallWinnerBibSet = new Set();

    uniqueDistances.forEach(catName => {
      const catRunners = allFinishedWithTimes.filter(r => (r.cat || 'Unknown') === catName);

      const males = catRunners
        .filter(r => isMale(r.gender))
        .sort((a, b) => a.sortTime - b.sortTime);

      const females = catRunners
        .filter(r => isFemale(r.gender))
        .sort((a, b) => a.sortTime - b.sortTime);

      const male1 = males[0] || null;
      const female1 = females[0] || null;

      if (male1 && male1.bib) overallWinnerBibSet.add(String(male1.bib));
      if (female1 && female1.bib) overallWinnerBibSet.add(String(female1.bib));

      const catObj = categories.find(c => (c.name || c.code) === catName);

      overallLeadersAll.push({
        cat: catName,
        color: catObj?.color || 'var(--ink)',
        male: male1,
        female: female1,
      });
    });

    const filteredOverall = selectedDistance === 'ALL'
      ? overallLeadersAll
      : overallLeadersAll.filter(item => item.cat === selectedDistance);

    // 3. Filter finished runners for selected distance AND EXCLUDE overall winners
    // (1 คนรับได้แค่ 1 รางวัล: คนที่ได้ overall จะต้องไม่แสดงในตารางจัดอันดับปกติ)
    let eligibleRunners = allFinishedWithTimes.filter(r => !r.bib || !overallWinnerBibSet.has(String(r.bib)));

    if (selectedDistance !== 'ALL') {
      eligibleRunners = eligibleRunners.filter(r => r.cat === selectedDistance);
    }

    // Group by category (distance), gender, age_group
    const groups = {};
    eligibleRunners.forEach(r => {
      const cat = r.cat || 'Unknown';
      const gender = isMale(r.gender) ? 'Male' : (isFemale(r.gender) ? 'Female' : 'Unknown');
      const cleanGender = formatEnglishLabel(r.gender) !== '—' ? formatEnglishLabel(r.gender) : gender;
      const ageGrp = r.age_group || 'Overall';
      const cleanAge = formatEnglishLabel(ageGrp);
      
      const groupKey = `${cat}_${gender}_${ageGrp}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          cat,
          gender,
          ageGrp,
          cleanAge,
          cleanGender,
          label: `${cleanAge} (${cleanGender})`,
          runners: []
        };
      }
      groups[groupKey].runners.push(r);
    });

    // Sort each group and take top 5
    const result = Object.values(groups).map(g => {
      g.runners.sort((a, b) => a.sortTime - b.sortTime);
      g.runners = g.runners.slice(0, 5);
      return g;
    });

    // Sort groups themselves by cat, then gender, then age group (youngest first)
    result.sort((a, b) => {
      if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
      if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
      return parseAgeGroupMin(a.ageGrp) - parseAgeGroupMin(b.ageGrp);
    });

    return { overallLeaders: filteredOverall, leaderboards: result };
  }, [runners, stations, selectedDistance, categories]);

  const formatMs = (ms, finishFallback = null) => {
    if (ms != null && ms > 0) {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    if (finishFallback != null) {
      const d = new Date(finishFallback);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('th-TH', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      }
    }

    return '--:--:--';
  };

  return (
    <div className="page active" style={{ maxWidth: '1400px', margin: '0 auto', overflowX: 'hidden' }}>
      <style>{`
        .admin-leaderboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }
        .admin-leaderboard-card {
          background: #fff;
          border-radius: 12px;
          padding: 14px 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.04);
          border: 1px solid var(--line);
        }
        .admin-leaderboard-header {
          padding-left: 10px;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .admin-leaderboard-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
        }
        .admin-leaderboard-cat {
          font-size: 11px;
          color: var(--ink-2);
          font-weight: 600;
          margin-top: 2px;
        }
        .admin-leaderboard-rows {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .admin-leaderboard-row {
          display: flex;
          align-items: center;
          padding-bottom: 8px;
          gap: 6px;
        }
        .admin-leaderboard-rank {
          width: 22px;
          font-size: 15px;
          font-weight: 800;
          text-align: left;
          flex-shrink: 0;
        }
        .admin-leaderboard-name-col {
          flex: 1;
          min-width: 0;
          padding-left: 4px;
        }
        .admin-leaderboard-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: baseline;
          gap: 4px;
        }
        .admin-leaderboard-name-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .admin-leaderboard-bib {
          color: var(--ink-2);
          font-weight: 600;
          font-size: 11px;
          flex-shrink: 0;
        }
        .admin-leaderboard-time-col {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .admin-leaderboard-time {
          font-size: 13px;
          font-weight: 600;
          font-family: var(--mono);
          white-space: nowrap;
        }
        .admin-leaderboard-net-label {
          font-size: 9px;
          color: var(--ink-2);
        }
        .admin-leaderboard-print-btn {
          background: transparent;
          border: none;
          color: var(--ink-2);
          cursor: pointer;
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 768px) {
          .admin-leaderboard-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }
          .admin-leaderboard-card {
            padding: 7px 6px !important;
            border-radius: 8px !important;
          }
          .admin-leaderboard-header {
            margin-bottom: 6px !important;
            padding-left: 5px !important;
            border-left-width: 3px !important;
          }
          .admin-leaderboard-header h3 {
            font-size: 0.74rem !important;
            line-height: 1.15 !important;
          }
          .admin-leaderboard-cat {
            font-size: 0.6rem !important;
          }
          .admin-leaderboard-rows {
            gap: 2px !important;
          }
          .admin-leaderboard-row {
            padding-bottom: 2px !important;
            gap: 3px !important;
          }
          .admin-leaderboard-rank {
            width: 14px !important;
            font-size: 0.72rem !important;
          }
          .admin-leaderboard-name-col {
            padding-left: 2px !important;
          }
          .admin-leaderboard-name {
            font-size: 0.68rem !important;
            line-height: 1.15 !important;
            gap: 2px !important;
          }
          .admin-leaderboard-name-text {
            max-width: 58px !important;
          }
          .admin-leaderboard-bib {
            font-size: 0.52rem !important;
            margin-right: 2px !important;
          }
          .admin-leaderboard-time-col {
            gap: 2px !important;
          }
          .admin-leaderboard-time {
            font-size: 0.68rem !important;
          }
          .admin-leaderboard-net-label {
            font-size: 0.46rem !important;
          }
          .admin-leaderboard-print-btn {
            padding: 1px !important;
          }
          .admin-leaderboard-print-btn svg {
            width: 11px !important;
            height: 11px !important;
          }
        }
      `}</style>
      
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '12px' }}>
            Live Leaderboard
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--ink-2)', fontWeight: 500 }}>
            Top 5 Official Results
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Distance Toggle */}
          {distances.length > 0 && (
            <div style={{ display: 'flex', background: '#fff', borderRadius: '30px', border: '1px solid var(--line)', padding: '4px' }}>
              <button
                onClick={() => setSelectedDistance('ALL')}
                style={{
                  background: selectedDistance === 'ALL' ? 'var(--ink)' : 'transparent',
                  color: selectedDistance === 'ALL' ? '#fff' : 'var(--ink)',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '6px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ALL
              </button>
              {distances.map(d => {
                const dColor = categories.find(c => c.name === d)?.color || '#3b82f6';
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDistance(d)}
                    style={{
                      background: selectedDistance === d ? dColor : 'transparent',
                      color: selectedDistance === d ? '#fff' : dColor,
                      border: selectedDistance === d ? 'none' : `1px solid ${dColor}`,
                      borderRadius: '24px',
                      padding: '6px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}

          <select
            className="search"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{ minWidth: '180px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
          >
            {events.length === 0 && <option value="">ไม่มีงานวิ่ง</option>}
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <button
            className="btn btn-sm"
            onClick={() => fetchData()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '14px', fontWeight: 600 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* 🏆 ทำเนียบผู้นำ Overall (อันดับ 1 ชาย / หญิง แต่ละระยะ ไม่สนรุ่นอายุ) */}
      <div style={{ marginBottom: '32px' }}>
        <div className="admin-overall-card">
          <div className="admin-overall-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#fef3c7', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trophy size={24} color="#d97706" />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 'clamp(15px, 3.5vw, 18px)', fontWeight: 800, color: '#92400e' }}>
                  ทำเนียบผู้นำ Overall (อันดับ 1 ชาย / หญิง)
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#b45309', fontWeight: 500, marginTop: '2px' }}>
                  ไม่จำกัดรุ่นอายุ · สนเฉพาะระยะทางและเพศ
                </p>
              </div>
            </div>

            <div className="admin-overall-badge">
              ⭐ ผู้ได้รางวัล Overall จะไม่นำไปจัดอันดับในรุ่นอายุ (1 คนรับได้ 1 รางวัล)
            </div>
          </div>

          {overallLeaders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-2)' }}>
              ยังไม่มีข้อมูลผู้เข้าเส้นชัยในขณะนี้
            </div>
          ) : (
            <div className="admin-overall-grid">
              {overallLeaders.map(item => (
                <div key={item.cat} className="admin-overall-item-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ background: item.color || '#0f172a', color: '#ffffff', padding: '3px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
                      {item.cat}
                    </span>
                    <span style={{ fontSize: '12px', color: '#78716c', fontWeight: 600 }}>
                      Overall Champion
                    </span>
                  </div>

                  {/* Male Champion */}
                  <div className="admin-overall-champ-row male">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <div style={{ width: '36px', height: '28px', borderRadius: '6px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '11px', flexShrink: 0 }}>
                        Male
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {item.male ? (
                          <>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              🥇 {item.male.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#0284c7' }}>BIB: {item.male.bib}</span>
                              {item.male.age_group && <span>· {formatEnglishLabel(item.male.age_group)}</span>}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>— ยังไม่มีผู้เข้าเส้นชัย —</div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, paddingLeft: '6px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: item.male ? '#16a34a' : '#94a3b8', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {item.male ? formatMs(item.male.netTimeMs, item.male.finish) : '--:--:--'}
                        </div>
                        {item.male && (
                          <div style={{ fontSize: '10px', color: item.male.netTimeMs != null ? '#64748b' : '#0284c7', fontWeight: 600 }}>
                            {item.male.netTimeMs != null ? 'Net Time' : 'Finish Time'}
                          </div>
                        )}
                      </div>
                      {item.male && (
                        <button 
                          onClick={() => setSelectedSlip({ runner: item.male, catRank: 'Overall 1' })} 
                          style={{ background: 'rgba(0,0,0,0.04)', border: 'none', color: 'var(--ink-2)', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Print E-Slip"
                        >
                          <Printer size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Female Champion */}
                  <div className="admin-overall-champ-row female">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <div style={{ width: '46px', height: '28px', borderRadius: '6px', background: '#fce7f3', color: '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '11px', flexShrink: 0 }}>
                        Female
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {item.female ? (
                          <>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              🥇 {item.female.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#db2777' }}>BIB: {item.female.bib}</span>
                              {item.female.age_group && <span>· {formatEnglishLabel(item.female.age_group)}</span>}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>— ยังไม่มีผู้เข้าเส้นชัย —</div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, paddingLeft: '6px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: item.female ? '#16a34a' : '#94a3b8', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {item.female ? formatMs(item.female.netTimeMs, item.female.finish) : '--:--:--'}
                        </div>
                        {item.female && (
                          <div style={{ fontSize: '10px', color: item.female.netTimeMs != null ? '#64748b' : '#0284c7', fontWeight: 600 }}>
                            {item.female.netTimeMs != null ? 'Net Time' : 'Finish Time'}
                          </div>
                        )}
                      </div>
                      {item.female && (
                        <button 
                          onClick={() => setSelectedSlip({ runner: item.female, catRank: 'Overall 1' })} 
                          style={{ background: 'rgba(0,0,0,0.04)', border: 'none', color: 'var(--ink-2)', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Print E-Slip"
                        >
                          <Printer size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 🏃 ตารางจัดอันดับตามรุ่นอายุ */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(17px, 4vw, 20px)', fontWeight: 800, color: 'var(--ink)' }}>
          ตารางจัดอันดับตามรุ่นอายุ (Top 5)
        </h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--ink-2)' }}>
          * นักวิ่งที่ได้รับรางวัล Overall อันดับ 1 ชาย/หญิง ได้รับการตัดสิทธิ์ออกจากรุ่นอายุแล้ว เพื่อส่งต่อรางวัลให้ลำดับถัดไป (1 คนรับได้ 1 รางวัล)
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink-2)' }}>กำลังโหลดข้อมูล...</div>
      ) : leaderboards.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink-2)', background: '#fff', borderRadius: '16px', border: '1px solid var(--line)' }}>ไม่มีข้อมูลผลการแข่งขันในขณะนี้</div>
      ) : (
        <div className="admin-leaderboard-grid">
          {leaderboards.map(group => {
            const catObj = categories.find(c => c.name === group.cat);
            const headerColor = catObj?.color || 'var(--ink)';

            return (
              <div key={`${group.cat}_${group.label}`} className="admin-leaderboard-card">
                
                {/* Card Header */}
                <div className="admin-leaderboard-header" style={{ borderLeft: `4px solid ${headerColor}` }}>
                  <div>
                    <h3 style={{ color: headerColor }}>{group.label}</h3>
                    {selectedDistance === 'ALL' && <div className="admin-leaderboard-cat">{group.cat}</div>}
                  </div>
                </div>

              {/* Rows */}
              <div className="admin-leaderboard-rows">
                {[1, 2, 3, 4, 5].map(rank => {
                  const runner = group.runners[rank - 1];
                  
                  return (
                    <div key={rank} className="admin-leaderboard-row" style={{
                      borderBottom: rank !== 5 ? '1px solid var(--line)' : 'none',
                      opacity: runner ? 1 : 0.4
                    }}>
                      <div className="admin-leaderboard-rank" style={{ 
                        color: rank === 1 ? '#f5b60a' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : 'var(--line-heavy)',
                      }}>
                        {rank}
                      </div>
                      
                      <div className="admin-leaderboard-name-col">
                        <div className="admin-leaderboard-name">
                          {runner ? (
                            <>
                              {runner.bib && <span className="admin-leaderboard-bib">{runner.bib}</span>}
                              <span className="admin-leaderboard-name-text">{runner.name || 'Unknown Runner'}</span>
                            </>
                          ) : '---'}
                        </div>
                      </div>
                      
                      <div className="admin-leaderboard-time-col">
                        <div style={{ textAlign: 'right' }}>
                          <div className="admin-leaderboard-time" style={{ color: runner ? '#16a34a' : 'var(--line-heavy)' }}>
                            {runner ? formatMs(runner.netTimeMs, runner.finish) : '--:--:--'}
                          </div>
                          {runner && (
                            <div className="admin-leaderboard-net-label" style={{ color: runner.netTimeMs != null ? undefined : '#0284c7' }}>
                              {runner.netTimeMs != null ? 'Net Time' : 'Finish Time'}
                            </div>
                          )}
                        </div>
                        {runner && (
                          <button 
                            className="admin-leaderboard-print-btn"
                            onClick={() => setSelectedSlip({ runner, catRank: rank })} 
                            title="Print E-Slip"
                          >
                            <Printer size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })}
        </div>
      )}

      {selectedSlip && (() => {
        const targetRunner = selectedSlip.runner;
        const ranks = computeRunnerRanks(targetRunner, runners);
        return (
          <ESlipModal 
            runner={targetRunner} 
            overallRank={ranks.overallRank} 
            catRank={selectedSlip.catRank || ranks.catRank} 
            stations={targetRunner?.categoryStations?.length ? targetRunner.categoryStations : stations}
            runners={runners}
            categories={categories}
            onClose={() => setSelectedSlip(null)}
          />
        );
      })()}
    </div>
  );
}
