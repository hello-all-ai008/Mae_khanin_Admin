import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchAllRows } from '../lib/supabaseFetch';
import { useRace } from '../context/RaceContext';
import AdvancedTable from '../components/AdvancedTable';
import ESlipModal from '../components/ESlipModal';
import { computeRunnerRanks } from '../components/ESlip';
import { RefreshCw, Printer } from 'lucide-react';
import { fetchCategoryStartMap, attachGunStartTime } from '../lib/categoryStartTimes';

export default function OverallDashboard() {
  const { addToast } = useRace();
  // addToast comes from RaceContext and gets a new identity on every context
  // render — read it via ref so fetchData's own identity stays stable and
  // doesn't re-trigger the fetch/realtime-resubscribe effects below.
  const addToastRef = useRef(addToast);
  useEffect(() => {
    addToastRef.current = addToast;
  });
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [stations, setStations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [runners, setRunners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);

  // Fetch Events on load
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
      // Fetch stations
      const { data: stData, error: stError } = await supabase
        .from('stations')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('sequence_order', { ascending: true });
      if (stError) throw stError;
      setStations(stData || []);

      // Fetch categories
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('distance_km', { ascending: true });
      if (catError) console.warn('Categories fetch error', catError);
      setCategories(catData || []);

      const catStartMap = await fetchCategoryStartMap(supabase, catData || []);

      // Fetch runners
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
      actualRunners = actualRunners.map(r => attachGunStartTime(r, catStartMap));
      setRunners(actualRunners);

    } catch (err) {
      console.error('Fetch dashboard error:', err);
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
      .channel(`runners-live-dashboard-${selectedEventId}`)
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
          console.error('Realtime subscribe error (dashboard):', status, err);
        }
      });

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [selectedEventId, fetchData]);

  // Runners scoped to the selected ระยะ (categoryFilter), so the stat tiles
  // and table below follow whichever distance button is active. Same
  // matching convention as RunnerProgressControl.jsx's statsRunners. Sorted
  // by BIB ascending (numeric, not string) so the table has a sensible
  // default order instead of raw fetch/insertion order — AdvancedTable's own
  // click-to-sort still works from here as usual.
  const scopedRunners = useMemo(() => {
    const list = categoryFilter === 'ALL'
      ? runners
      : runners.filter(r => {
          const rCat = (r.cat || r.category_id || '').toLowerCase();
          return rCat.includes(categoryFilter.toLowerCase());
        });
    return [...list].sort((a, b) => {
      const bibA = Number(a.bib);
      const bibB = Number(b.bib);
      if (!isNaN(bibA) && !isNaN(bibB)) return bibA - bibB;
      return String(a.bib || '').localeCompare(String(b.bib || ''), undefined, { numeric: true });
    });
  }, [runners, categoryFilter]);

  // Compute stats
  const stats = useMemo(() => {
    const total = scopedRunners.length;
    if (total === 0) return { checkedIn: 0, started: 0, finished: 0, dns: 0, dnf: 0, total: 0 };

    let checkedIn = 0;
    let started = 0;
    let finished = 0;

    const startStation = stations.find(s => s.type === 'START');

    scopedRunners.forEach(r => {
      // Check-in
      if (r.registration_status === 'CHECKED_IN' || r.checked_in_at) {
        checkedIn++;
      }

      // Start
      let hasStarted = false;
      if (startStation && r.cps && r.cps[startStation.id]) {
        hasStarted = true;
      }
      // Fallback
      if (Object.keys(r.cps || {}).length > 0 || r.finish) {
        hasStarted = true;
      }
      if (hasStarted) started++;

      // Finish
      if (r.finish) finished++;
    });

    const dns = scopedRunners.filter(r => r.race_status === 'DNS').length;
    const dnf = scopedRunners.filter(r => r.race_status === 'DNF').length;

    return { checkedIn, started, finished, dns, dnf, total };
  }, [scopedRunners, stations]);

  // Same priority convention as RunnerProgressControl.jsx's getRunnerStatus /
  // RunnersList.jsx's statusOf: explicit race_status wins, then finish, then
  // started (checked-in or has any CP scan), else '-'.
  const getRunnerStatusLabel = (r) => {
    if (r.race_status === 'DNF') return 'DNF';
    if (r.race_status === 'DNS') return 'DNS';
    if (r.finish) return 'Finished';
    const hasStarted = Object.keys(r.cps || {}).length > 0 || r.checked_in_at || r.registration_status === 'CHECKED_IN';
    return hasStarted ? 'In Race' : '-';
  };

  // Columns for the table
  const columns = useMemo(() => {
    const cols = [
      {
        key: 'print',
        label: 'พิมพ์',
        defaultWidth: 150,
        align: 'center',
        filterable: false,
        sortable: false,
        render: (_, r) => (
          <button className="btn btn-sm" onClick={() => setSelectedSlip(r)} title="พิมพ์ Slip" style={{ padding: '4px', background: 'transparent', border: 'none', color: 'var(--ink)' }}>
            <Printer size={16} />
          </button>
        )
      },
      { key: 'name', label: 'Name', defaultWidth: 280 },
      { key: 'bib', label: 'BIB', defaultWidth: 160, align: 'center' },
      {
        key: 'checkin',
        label: 'Check-In',
        defaultWidth: 170,
        align: 'center',
        valueGetter: (r) => (r.registration_status === 'CHECKED_IN' || r.checked_in_at ? '✓ Checked-In' : '-'),
        render: (_, r) => {
          return (r.registration_status === 'CHECKED_IN' || r.checked_in_at)
            ? <span style={{ color: 'var(--ok)', fontWeight: 'bold' }}>✓</span>
            : <span style={{ color: 'var(--line)' }}>-</span>;
        }
      },
      {
        key: 'race_status_display',
        label: 'สถานะ',
        defaultWidth: 150,
        align: 'center',
        valueGetter: (r) => getRunnerStatusLabel(r),
        render: (_, r) => {
          const label = getRunnerStatusLabel(r);
          const colorMap = {
            DNF: '#ea580c',
            DNS: '#dc2626',
            Finished: '#1a9e5c',
            'In Race': '#f5b60a'
          };
          if (label === '-') return <span style={{ color: 'var(--line)' }}>-</span>;
          return <span style={{ color: colorMap[label] || 'var(--ink)', fontWeight: 700 }}>{label}</span>;
        }
      }
    ];

    stations.forEach(st => {
      const getStationTime = (r) => {
        if (st.type === 'FINISH') {
          return r.finish
            ? new Date(r.finish).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '-';
        }
        const scanTime = r.cps?.[st.id];
        return scanTime
          ? new Date(scanTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '-';
      };

      cols.push({
        key: `st_${st.id}`,
        label: st.name,
        defaultWidth: 190,
        align: 'center',
        valueGetter: getStationTime,
        render: (_, r) => {
          const val = getStationTime(r);
          if (val === '-') return <span style={{ color: 'var(--line)' }}>-</span>;
          if (st.type === 'FINISH') {
            return <span style={{ color: 'var(--finish)', fontWeight: 600 }}>{val}</span>;
          }
          return <span style={{ color: 'var(--ink)' }}>{val}</span>;
        }
      });
    });

    const getTotalTime = (r) => {
      const startSt = stations.find(s => s.type === 'START');
      const startTime = startSt && r.cps?.[startSt.id];
      const finishTime = r.finish;
      if (startTime && finishTime) {
        const diffMs = new Date(finishTime).getTime() - new Date(startTime).getTime();
        const hrs = Math.floor(diffMs / 3600000).toString().padStart(2, '0');
        const mins = Math.floor((diffMs % 3600000) / 60000).toString().padStart(2, '0');
        const secs = Math.floor((diffMs % 60000) / 1000).toString().padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
      }
      return '-';
    };

    cols.push({
      key: 'total_time',
      label: 'เวลาสุทธิ',
      defaultWidth: 180,
      align: 'center',
      valueGetter: getTotalTime,
      render: (_, r) => {
        const val = getTotalTime(r);
        if (val === '-') return <span style={{ color: 'var(--line)' }}>-</span>;
        return <span style={{ fontWeight: 600, color: 'var(--finish)' }}>{val}</span>;
      }
    });

    cols.push({ key: 'age_group', label: 'Age Grp', defaultWidth: 180, align: 'center' });

    cols.push({
      key: 'grp_rank',
      label: 'Grp Rank',
      defaultWidth: 170,
      align: 'center',
      valueGetter: (r) => computeRunnerRanks(r, runners).catRank,
      render: (_, r) => {
        const val = computeRunnerRanks(r, runners).catRank;
        return val === '—' ? <span style={{ color: 'var(--line)' }}>-</span> : <span style={{ fontWeight: 600 }}>{val}</span>;
      }
    });
    cols.push({
      key: 'overall',
      label: 'Overall',
      defaultWidth: 170,
      align: 'center',
      valueGetter: (r) => computeRunnerRanks(r, runners).overallRank,
      render: (_, r) => {
        const val = computeRunnerRanks(r, runners).overallRank;
        return val === '—' ? <span style={{ color: 'var(--line)' }}>-</span> : <span style={{ fontWeight: 600 }}>{val}</span>;
      }
    });

    return cols;
  }, [stations, runners]);

  const cardStyle = {
    background: '#fff',
    borderRadius: '16px',
    padding: '24px 20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--line)'
  };

  const numStyle = { fontSize: '42px', fontWeight: 700, lineHeight: 1, marginBottom: '8px', display: 'flex', alignItems: 'baseline', gap: '8px' };
  const labelStyle = { fontSize: '13.5px', color: 'var(--ink-2)', fontWeight: 500 };
  const percentStyle = { fontSize: '18px', fontWeight: 600, opacity: 0.8 };

  const getPercent = (count) => {
    if (stats.total === 0) return '0%';
    return Math.round((count / stats.total) * 100) + '%';
  };

  return (
    <div className="page active" style={{ maxWidth: '1400px', margin: '0 auto', overflowX: 'hidden' }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Overall Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            className="search"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{ minWidth: '220px', padding: '8px 12px', borderRadius: '8px' }}
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

      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '2px' }}>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            style={{
              border: '1px solid',
              borderColor: categoryFilter === 'ALL' ? 'var(--ink)' : 'var(--line)',
              background: categoryFilter === 'ALL' ? 'var(--ink)' : 'var(--bg-soft)',
              color: categoryFilter === 'ALL' ? '#fff' : 'var(--ink-2)',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            ทั้งหมด
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.name)}
              style={{
                border: '1px solid',
                borderColor: categoryFilter === c.name ? 'var(--ink)' : 'var(--line)',
                background: categoryFilter === c.name ? 'var(--ink)' : 'var(--bg-soft)',
                color: categoryFilter === c.name ? '#fff' : 'var(--ink-2)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {c.name} ({c.distance_km} {c.unit || 'km'})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--ink-2)' }}>กำลังโหลดข้อมูล...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%)' }}>
              <div style={{ ...numStyle, color: 'var(--ink)' }}>
                {stats.checkedIn} <span style={{ ...percentStyle, color: 'var(--ink-2)' }}>{getPercent(stats.checkedIn)}</span>
              </div>
              <div style={labelStyle}>Checked In</div>
            </div>

            <div style={cardStyle}>
              <div style={{ ...numStyle, color: '#f5b60a' }}>
                {stats.started} <span style={{ ...percentStyle, color: '#f5b60a' }}>{getPercent(stats.started)}</span>
              </div>
              <div style={labelStyle}>Started</div>
            </div>

            <div style={cardStyle}>
              <div style={{ ...numStyle, color: '#1a9e5c' }}>
                {stats.finished} <span style={{ ...percentStyle, color: '#1a9e5c' }}>{getPercent(stats.finished)}</span>
              </div>
              <div style={labelStyle}>Finished</div>
            </div>

            <div style={cardStyle}>
              <div style={{ ...numStyle, color: '#dc2626' }}>
                {stats.dns} <span style={{ ...percentStyle, color: '#dc2626' }}>{getPercent(stats.dns)}</span>
              </div>
              <div style={labelStyle}>DNS (Did Not Start)</div>
            </div>

            <div style={cardStyle}>
              <div style={{ ...numStyle, color: '#ea580c' }}>
                {stats.dnf} <span style={{ ...percentStyle, color: '#ea580c' }}>{getPercent(stats.dnf)}</span>
              </div>
              <div style={labelStyle}>DNF (Did Not Finish)</div>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--line)', padding: '4px', overflowX: 'auto' }}>
            {scopedRunners.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-2)' }}>ไม่มีข้อมูลนักวิ่ง</div>
            ) : (
              <AdvancedTable
                columns={columns}
                data={scopedRunners}
                pageSize={50}
                maxHeight="600px"
                rowSearchKey="bib"
                rowSearchLabel="BIB"
              />
            )}
          </div>
        </>
      )}

      {selectedSlip && (() => {
        const ranks = computeRunnerRanks(selectedSlip, runners);
        return (
          <ESlipModal 
            runner={selectedSlip} 
            overallRank={ranks.overallRank} 
            catRank={ranks.catRank} 
            stations={selectedSlip?.categoryStations?.length ? selectedSlip.categoryStations : stations}
            runners={runners}
            categories={categories}
            onClose={() => setSelectedSlip(null)}
          />
        );
      })()}
    </div>
  );
}
