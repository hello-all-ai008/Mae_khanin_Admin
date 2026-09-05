import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchAllRows } from '../lib/supabaseFetch';
import { useRace } from '../context/RaceContext';
import { RefreshCw, Trophy, ArrowLeft, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ESlipModal from '../components/ESlipModal';

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

      const { data: runData, error: runError } = await fetchAllRows((from, to) =>
        supabase
          .from('runners')
          .select('*')
          .eq('event_id', selectedEventId)
          .order('id', { ascending: true })
          .range(from, to)
      );
      if (runError) throw runError;
      
      let actualRunners = runData || [];
      const hasAnyFinish = actualRunners.some(r => r.finish);
      
      if (!hasAnyFinish) {
        // MOCK DATA for Demo
        const baseTime = Date.now() - 3600000 * 4;
        let s1_id = 's1', s2_id = 's2', s3_id = 's3', s4_id = 's4';
        const mockSt = [
          { id: 's1', type: 'START', name: 'Start', sequence_order: 1 },
          { id: 's2', type: 'CP', name: 'A1', sequence_order: 2 },
          { id: 's3', type: 'CP', name: 'A2', sequence_order: 3 },
          { id: 's4', type: 'FINISH', name: 'Finish', sequence_order: 4 },
        ];
        if (!stData || stData.length === 0) {
          setStations(mockSt);
        } else {
          const stStart = stData.find(s => s.type === 'START');
          const stCpList = stData.filter(s => s.type === 'CP').sort((a,b)=>a.sequence_order - b.sequence_order);
          const stFinish = stData.find(s => s.type === 'FINISH');
          if (stStart) s1_id = stStart.id;
          if (stCpList.length > 0) s2_id = stCpList[0].id;
          if (stCpList.length > 1) s3_id = stCpList[1].id;
          if (stFinish) s4_id = stFinish.id;
        }

        const mockRunners = [
          { id: 'm1', bib: '1001', name: 'Somchai Fast', gender: 'Male', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { [s1_id]: baseTime, [s2_id]: baseTime + 1800000, [s3_id]: baseTime + 3000000 }, finish: baseTime + 3600000 },
          { id: 'm2', bib: '1002', name: 'Wandee Run', gender: 'Female', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { [s1_id]: baseTime, [s2_id]: baseTime + 1900000, [s3_id]: baseTime + 3100000 }, finish: baseTime + 3700000 },
          { id: 'm3', bib: '1003', name: 'Mike T', gender: 'Male', age_group: '30-39', cat: '5 KM', registration_status: 'CHECKED_IN', cps: { [s1_id]: baseTime }, finish: baseTime + 1500000 },
          { id: 'm4', bib: '1004', name: 'Suda Trail', gender: 'Female', age_group: '30-39', cat: '5 KM', registration_status: 'CHECKED_IN', cps: { [s1_id]: baseTime }, finish: baseTime + 1600000 },
          { id: 'm5', bib: '1005', name: 'Mana Power', gender: 'Male', age_group: '40-49', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { [s1_id]: baseTime, [s2_id]: baseTime + 2000000 }, finish: null },
          { id: 'm6', bib: '1006', name: 'John Doe', gender: 'Male', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: {}, finish: null },
          { id: 'm7', bib: '1007', name: 'Sarah C', gender: 'Female', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { [s1_id]: baseTime }, finish: baseTime + 3800000 },
          { id: 'm8', bib: '1008', name: 'Alex B', gender: 'Male', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { [s1_id]: baseTime }, finish: baseTime + 3500000 },
          { id: 'm9', bib: '1009', name: 'Tiw Runner', gender: 'Male', age_group: '30-39', cat: '10 KM', registration_status: 'PRE_REGISTERED', cps: {}, finish: null },
        ];
        
        actualRunners = [...mockRunners, ...actualRunners];
      }
      
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

  // Group and rank runners
  const leaderboards = useMemo(() => {
    if (!runners.length) return [];
    
    const startStation = stations.find(s => s.type === 'START');
    
    // Filter finished runners first
    let finishedRunners = runners.filter(r => r.finish);
    
    if (selectedDistance !== 'ALL') {
      finishedRunners = finishedRunners.filter(r => r.cat === selectedDistance);
    }

    // Calculate time for each
    const withTimes = finishedRunners.map(r => {
      let startTime = null;
      if (startStation && r.cps && r.cps[startStation.id]) {
        startTime = r.cps[startStation.id];
      }
      
      let netTimeMs = 0;
      if (startTime && startTime < r.finish) {
        netTimeMs = r.finish - startTime; // Chip time
      } else {
        // Fallback if no start time, or if start > finish (anomaly)
        // Without knowing gun time, we can't reliably sort them, but let's just use finish time as a sort value if needed
        // Ideally, they have a start time. For now, use finish time as a fallback proxy if start time is missing.
        netTimeMs = r.finish; 
      }
      
      return { ...r, netTimeMs, startTime };
    });

    // Group by category (distance), gender, age_group
    const groups = {};
    withTimes.forEach(r => {
      const cat = r.cat || 'Unknown';
      const gender = (r.gender || 'Unknown').toLowerCase().startsWith('m') ? 'Male' : (r.gender || 'Unknown').toLowerCase().startsWith('f') ? 'Female' : 'Unknown';
      const ageGrp = r.age_group || 'Overall';
      
      const groupKey = `${cat}_${gender}_${ageGrp}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          cat,
          gender,
          ageGrp,
          label: `${ageGrp} ${gender}`,
          runners: []
        };
      }
      groups[groupKey].runners.push(r);
    });

    // Sort each group and take top 5
    const result = Object.values(groups).map(g => {
      g.runners.sort((a, b) => a.netTimeMs - b.netTimeMs);
      g.runners = g.runners.slice(0, 5);
      return g;
    });

    // Sort groups themselves by cat, then gender, then age group
    result.sort((a, b) => {
      if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
      if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
      return a.ageGrp.localeCompare(b.ageGrp);
    });

    return result;
  }, [runners, stations, selectedDistance]);

  const formatMs = (ms, hasStartTime) => {
    if (!hasStartTime) {
      // If we don't have start time, returning finish epoch isn't useful for display.
      // We'll just show the finish time of day.
      const d = new Date(ms);
      return `Finish: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    }
    
    // Duration
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    const hh = hours.toString().padStart(2, '0');
    const mm = mins.toString().padStart(2, '0');
    const ss = secs.toString().padStart(2, '0');
    
    return `${hh}:${mm}:${ss}`;
  };

  return (
    <div className="page active" style={{ maxWidth: '1400px', margin: '0 auto', overflowX: 'hidden' }}>
      
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
              {distances.map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDistance(d)}
                  style={{
                    background: selectedDistance === d ? 'var(--ink)' : 'transparent',
                    color: selectedDistance === d ? '#fff' : 'var(--ink)',
                    border: 'none',
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
              ))}
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

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink-2)' }}>กำลังโหลดข้อมูล...</div>
      ) : leaderboards.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink-2)', background: '#fff', borderRadius: '16px', border: '1px solid var(--line)' }}>ไม่มีข้อมูลผลการแข่งขันในขณะนี้</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
          {leaderboards.map(group => {
            const catObj = categories.find(c => c.name === group.cat);
            const headerColor = catObj?.color || 'var(--ink)';

            return (
              <div key={`${group.cat}_${group.label}`} style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid var(--line)' }}>
                
                {/* Card Header */}
                <div style={{ borderLeft: `4px solid ${headerColor}`, paddingLeft: '12px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: headerColor }}>{group.label}</h3>
                    {selectedDistance === 'ALL' && <div style={{ fontSize: '13px', color: 'var(--ink-2)', fontWeight: 600, marginTop: '2px' }}>{group.cat}</div>}
                  </div>
                </div>

              {/* Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[1, 2, 3, 4, 5].map(rank => {
                  const runner = group.runners[rank - 1];
                  
                  return (
                    <div key={rank} style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      paddingBottom: '16px',
                      borderBottom: rank !== 5 ? '1px solid var(--line)' : 'none',
                      opacity: runner ? 1 : 0.4
                    }}>
                      <div style={{ 
                        width: '32px', 
                        fontSize: '20px', 
                        fontWeight: 800, 
                        color: rank === 1 ? '#f5b60a' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : 'var(--line-heavy)',
                        textAlign: 'left'
                      }}>
                        {rank}
                      </div>
                      
                      <div style={{ flex: 1, paddingLeft: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                          {runner ? (
                            <>
                              {runner.bib && <span style={{ color: 'var(--ink-2)', marginRight: '6px', fontWeight: 600, fontSize: '12px' }}>{runner.bib}</span>}
                              {runner.name || 'Unknown Runner'}
                            </>
                          ) : '---'}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: runner ? '#16a34a' : 'var(--line-heavy)' }}>
                          {runner ? formatMs(runner.netTimeMs, !!runner.startTime) : '--:--:--'}
                        </div>
                        {runner && (
                          <button 
                            onClick={() => setSelectedSlip({ runner, catRank: rank })} 
                            style={{ background: 'transparent', border: 'none', color: 'var(--ink-2)', cursor: 'pointer', padding: '4px', display: 'flex' }}
                            title="Print E-Slip"
                          >
                            <Printer size={16} />
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

      {selectedSlip && (
        <ESlipModal 
          runner={selectedSlip.runner} 
          overallRank="-" 
          catRank={selectedSlip.catRank} 
          stations={stations}
          onClose={() => setSelectedSlip(null)} 
        />
      )}
    </div>
  );
}
