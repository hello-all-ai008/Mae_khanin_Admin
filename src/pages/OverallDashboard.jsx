import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRace } from '../context/RaceContext';
import AdvancedTable from '../components/AdvancedTable';
import ESlipModal from '../components/ESlipModal';
import { RefreshCw, Printer } from 'lucide-react';

export default function OverallDashboard() {
  const { addToast } = useRace();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [stations, setStations] = useState([]);
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

  const fetchData = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      // Fetch stations
      const { data: stData, error: stError } = await supabase
        .from('stations')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('sequence_order', { ascending: true });
      if (stError) throw stError;
      setStations(stData || []);

      // Fetch runners
      const { data: runData, error: runError } = await supabase
        .from('runners')
        .select('*')
        .eq('event_id', selectedEventId);
      let actualRunners = runData || [];
      const hasAnyFinish = actualRunners.some(r => r.finish);

      if (!hasAnyFinish) {
        // MOCK DATA for Demo (Inject if no real runners have finished yet)
        const baseTime = Date.now() - 3600000 * 4;
        const mockSt = [
          { id: 's1', type: 'START', name: 'Start', sequence_order: 1 },
          { id: 's2', type: 'CP', name: 'A1', sequence_order: 2 },
          { id: 's3', type: 'FINISH', name: 'Finish', sequence_order: 3 },
        ];
        if (!stData || stData.length === 0) setStations(mockSt);

        const mockRunners = [
          { id: 'm1', bib: '1001', name: 'Somchai Fast', gender: 'Male', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { s1: baseTime, s2: baseTime + 1800000 }, finish: baseTime + 3600000 },
          { id: 'm2', bib: '1002', name: 'Wandee Run', gender: 'Female', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { s1: baseTime, s2: baseTime + 1900000 }, finish: baseTime + 3700000 },
          { id: 'm3', bib: '1003', name: 'Mike T', gender: 'Male', age_group: '30-39', cat: '5 KM', registration_status: 'CHECKED_IN', cps: { s1: baseTime }, finish: baseTime + 1500000 },
          { id: 'm4', bib: '1004', name: 'Suda Trail', gender: 'Female', age_group: '30-39', cat: '5 KM', registration_status: 'CHECKED_IN', cps: { s1: baseTime }, finish: baseTime + 1600000 },
          { id: 'm5', bib: '1005', name: 'Mana Power', gender: 'Male', age_group: '40-49', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { s1: baseTime, s2: baseTime + 2000000 }, finish: null },
          { id: 'm6', bib: '1006', name: 'John Doe', gender: 'Male', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: {}, finish: null },
          { id: 'm7', bib: '1007', name: 'Sarah C', gender: 'Female', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { s1: baseTime }, finish: baseTime + 3800000 },
          { id: 'm8', bib: '1008', name: 'Alex B', gender: 'Male', age_group: '20-29', cat: '10 KM', registration_status: 'CHECKED_IN', cps: { s1: baseTime }, finish: baseTime + 3500000 },
          { id: 'm9', bib: '1009', name: 'Tiw Runner', gender: 'Male', age_group: '30-39', cat: '10 KM', registration_status: 'PRE_REGISTERED', cps: {}, finish: null },
        ];

        actualRunners = [...mockRunners, ...actualRunners];
      }

      setRunners(actualRunners);

    } catch (err) {
      console.error('Fetch dashboard error:', err);
      addToast(`ดึงข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedEventId]);

  // Compute stats
  const stats = useMemo(() => {
    const total = runners.length;
    if (total === 0) return { checkedIn: 0, started: 0, finished: 0, dns: 0, total: 0 };

    let checkedIn = 0;
    let started = 0;
    let finished = 0;

    const startStation = stations.find(s => s.type === 'START');

    runners.forEach(r => {
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

    const dns = total - started;

    return { checkedIn, started, finished, dns, total };
  }, [runners, stations]);

  // Columns for the table
  const columns = useMemo(() => {
    const cols = [
      {
        key: 'print',
        label: 'พิมพ์',
        defaultWidth: 70,
        align: 'center',
        render: (_, r) => (
          <button className="btn btn-sm" onClick={() => setSelectedSlip(r)} title="พิมพ์ Slip" style={{ padding: '4px', background: 'transparent', border: 'none', color: 'var(--ink)' }}>
            <Printer size={16} />
          </button>
        )
      },
      { key: 'name', label: 'Name', defaultWidth: 200 },
      { key: 'bib', label: 'BIB', defaultWidth: 80, align: 'center' },
      {
        key: 'checkin',
        label: 'Check-In',
        defaultWidth: 90,
        align: 'center',
        render: (_, r) => {
          return (r.registration_status === 'CHECKED_IN' || r.checked_in_at)
            ? <span style={{ color: 'var(--ok)', fontWeight: 'bold' }}>✓</span>
            : <span style={{ color: 'var(--line)' }}>-</span>;
        }
      }
    ];

    stations.forEach(st => {
      cols.push({
        key: `st_${st.id}`,
        label: st.name,
        defaultWidth: 110,
        align: 'center',
        render: (_, r) => {
          if (st.type === 'FINISH') {
            return r.finish
              ? <span style={{ color: 'var(--finish)', fontWeight: 600 }}>{new Date(r.finish).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              : <span style={{ color: 'var(--line)' }}>-</span>;
          }
          const scanTime = r.cps?.[st.id];
          return scanTime
            ? <span style={{ color: 'var(--ink)' }}>{new Date(scanTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            : <span style={{ color: 'var(--line)' }}>-</span>;
        }
      });
    });

    cols.push({ key: 'age_group', label: 'Age Grp', defaultWidth: 100, align: 'center' });

    cols.push({
      key: 'grp_rank',
      label: 'Grp Rank',
      defaultWidth: 90,
      align: 'center',
      render: () => <span style={{ color: 'var(--line)' }}>-</span>
    });
    cols.push({
      key: 'overall',
      label: 'Overall',
      defaultWidth: 90,
      align: 'center',
      render: () => <span style={{ color: 'var(--line)' }}>-</span>
    });

    return cols;
  }, [stations]);

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
            onClick={fetchData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '14px', fontWeight: 600 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

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
          </div>

          <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid var(--line)', padding: '4px', overflowX: 'auto' }}>
            {runners.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-2)' }}>ไม่มีข้อมูลนักวิ่ง</div>
            ) : (
              <AdvancedTable
                columns={columns}
                data={runners}
                pageSize={50}
                maxHeight="600px"
              />
            )}
          </div>
        </>
      )}

      {selectedSlip && (
        <ESlipModal 
          runner={selectedSlip} 
          overallRank="-" 
          catRank="-" 
          onClose={() => setSelectedSlip(null)} 
        />
      )}
    </div>
  );
}
