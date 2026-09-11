import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { assertWriteOk } from '../lib/supabaseResult';
import { fetchAllRows } from '../lib/supabaseFetch';
import { useRace } from '../context/RaceContext';
import AdvancedTable from '../components/AdvancedTable';
import EditRunnerModal from '../components/EditRunnerModal';
import { Trash2, RefreshCw, Users } from 'lucide-react';

export default function RunnersList() {
  const { addToast, showConfirm, updateRunner, preloadEventData } = useRace();
  // addToast comes from RaceContext and gets a new identity on every context
  // render — read it via ref so fetchRunners's own identity stays stable and
  // doesn't re-trigger the fetch/realtime-resubscribe effects below.
  const addToastRef = useRef(addToast);
  useEffect(() => {
    addToastRef.current = addToast;
  });
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  const [categories, setCategories] = useState([]);
  const [runners, setRunners] = useState([]);
  const [stations, setStations] = useState([]);
  // Cat name -> color hex, from the `categories` table (distinct from the
  // `categories` state above, which is just the unique `cat` strings seen
  // in runner rows, used for the filter dropdown).
  const [catColorMap, setCatColorMap] = useState({});

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedRunner, setSelectedRunner] = useState(null);

  // Fetch Events
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

  const fetchRunners = useCallback(async (silent = false) => {
    if (!selectedEventId) return;
    if (!silent) setLoading(true);
    try {
      const { data: stData, error: stError } = await supabase
        .from('stations')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('sequence_order', { ascending: true });
      if (stError) throw stError;
      setStations(stData || []);

      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('name, color')
        .eq('event_id', selectedEventId);
      if (catError) console.warn('Categories fetch error', catError);
      setCatColorMap(
        Object.fromEntries((catData || []).filter(c => c.name).map(c => [c.name, c.color]))
      );

      // PostgREST caps a single response at 1000 rows by default — page
      // through the full table instead of silently truncating past that.
      // `.order('id')` gives Postgres a deterministic sort so consecutive
      // `.range()` pages can't overlap or skip a row (LIMIT/OFFSET without
      // ORDER BY has no guaranteed row order between calls).
      const { data: runData, error } = await fetchAllRows((from, to) =>
        supabase
          .from('runners')
          .select('*')
          .eq('event_id', selectedEventId)
          .order('id', { ascending: true })
          .range(from, to)
      );

      if (error) throw error;
      if (runData) {
        const cleanRunners = runData.filter(r => r.bib !== 'RUNNER_CONFIG' && !String(r.bib || '').startsWith('__'));
        setRunners(cleanRunners);
        const uniqueCats = [...new Set(cleanRunners.map(r => r.cat).filter(Boolean))].sort();
        setCategories(uniqueCats);
      }
    } catch (err) {
      console.error('Fetch runners error:', err);
      addToastRef.current(`ดึงข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedEventId]);

  // Fetch Categories & Runners on Event change
  useEffect(() => {
    fetchRunners();
  }, [fetchRunners]);

  // Live update: any CP/finish scan writes to public.runners (from any
  // station device). Re-pull silently instead of forcing a manual refresh.
  // Debounced so a burst of scans coalesces into one re-fetch.
  useEffect(() => {
    if (!selectedEventId) return undefined;
    let debounceTimer = null;
    const scheduleRefetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchRunners(true), 400);
    };
    const channel = supabase
      .channel(`runners-live-runnerslist-${selectedEventId}`)
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
          console.error('Realtime subscribe error (runners list):', status, err);
        }
      });

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [selectedEventId, fetchRunners]);

  const handleEdit = (runner) => {
    setSelectedRunner(runner);
    setIsEditModalOpen(true);
  };

  const handleSaveRunner = (updatedRunner) => {
    setRunners(prev => prev.map(r => r.id === updatedRunner.id ? updatedRunner : r));
    if (typeof updateRunner === 'function') {
      updateRunner(updatedRunner);
    }
    if (preloadEventData && selectedEventId) {
      preloadEventData(selectedEventId, true).catch(console.warn);
    }
    addToast('อัปเดตข้อมูลนักวิ่งสำเร็จ', false);
  };

  const handleDelete = async (id, name) => {
    const confirmed = await showConfirm('ยืนยันการลบ', `คุณต้องการลบข้อมูลของ ${name} ใช่หรือไม่?`);
    if (!confirmed) return;
    try {
      // `.select('id')` so an RLS-filtered DELETE (204, no error) is not reported as success.
      assertWriteOk(await supabase.from('runners').delete().eq('id', id).select('id'));
      setRunners(prev => prev.filter(r => r.id !== id));
      if (preloadEventData && selectedEventId) {
        preloadEventData(selectedEventId, true).catch(console.warn);
      }
      addToast('ลบข้อมูลสำเร็จ', false);
    } catch (err) {
      console.error(err);
      addToast(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, true);
    }
  };

  // Clear all runners for current event
  const handleClearAllRunners = async () => {
    if (!selectedEventId) return;
    if (runners.length === 0) {
      addToast('ไม่มีรายชื่อนักวิ่งให้ลบในงานนี้', true);
      return;
    }

    const currentEventName = events.find(e => e.id === selectedEventId)?.name || 'งานวิ่งนี้';
    const confirmed = await showConfirm(
      '⚠️ ยืนยันการล้างรายชื่อนักวิ่งทั้งหมด',
      `คุณต้องการลบรายชื่อนักวิ่งทั้งหมดจำนวน ${runners.length} คน ใน "${currentEventName}" ใช่หรือไม่?\n\n(ระบบจะลบเฉพาะข้อมูลรายชื่อนักวิ่งในงานนี้เท่านั้น โดยไม่กระทบกับข้อมูลการตั้งค่างาน จุดตรวจ หรือประวัติเส้นทาง)`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      // Report the rows the database actually removed, not the rows on screen:
      // RLS answers a fully filtered DELETE with 204 and no error.
      const deleted = assertWriteOk(
        await supabase.from('runners').delete().eq('event_id', selectedEventId).select('id')
      );

      setRunners([]);
      setCategories([]);
      if (preloadEventData && selectedEventId) {
        try {
          await preloadEventData(selectedEventId, true);
        } catch (e) {
          console.warn('Preload sync after clear runners warning:', e);
        }
      }
      addToast(`✓ ล้างรายชื่อนักวิ่งทั้งหมด (${deleted.length} คน) เรียบร้อยแล้ว`, false);
    } catch (err) {
      console.error('Clear runners error:', err);
      addToast(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  const statusOf = (r, stList = stations) => {
    if (r.race_status === 'DNF') return { cls: 'b-dnf', txt: 'DNF' };
    if (r.race_status === 'DNS') return { cls: 'b-dns', txt: 'DNS' };
    if (r.finish) return { cls: 'b-fin', txt: 'Finished' };

    // Furthest checkpoint reached: highest sequence_order station whose id
    // is a key in r.cps (same lookup pattern as OverallDashboard.jsx's
    // per-station columns and LiveLeaderboard.jsx's getRunnerStartEpoch).
    const stArr = Array.isArray(stList) ? stList : (Array.isArray(stations) ? stations : []);
    if (r.cps && typeof r.cps === 'object' && stArr.length > 0) {
      const reached = stArr
        .filter(st => st && st.id && r.cps[st.id] != null)
        .sort((a, b) => (b.sequence_order ?? 0) - (a.sequence_order ?? 0))[0];
      const hasCheckedIn = !!(r.checked_in_at || r.registration_status === 'CHECKED_IN');
      // The Start badge specifically requires check-in first — a runner
      // scanned at Start but never checked in falls through to the
      // checked-in/registration fallback below instead. Other CP stations
      // are unaffected: the app deliberately allows scanning any CP in any
      // order (see RaceContext.jsx's CP branch — "ไม่อิงลำดับขั้น").
      if (reached && !(reached.type === 'START' && !hasCheckedIn)) {
        return { cls: reached.type === 'START' ? 'b-start' : 'b-cp', txt: reached.name };
      }
    }

    // r.checkin is never present on a real fetched row (RaceContext only ever
    // writes checked_in_at/registration_status to Supabase), so the old check
    // on r.checkin was dead code. Match OverallDashboard.jsx's correct check.
    if (r.checked_in_at || r.registration_status === 'CHECKED_IN') {
      return { cls: 'b-start', txt: 'Checked-in' };
    }
    if (r.registration_status) return { cls: 'b-reg', txt: r.registration_status };
    return { cls: 'b-reg', txt: 'Registered' };
  };

  const filtered = runners
    .filter(r => {
      const matchSearch = search
        ? (r.bib?.includes(search) || r.name?.toLowerCase().includes(search.toLowerCase()) || r.age_group?.toLowerCase().includes(search.toLowerCase()))
        : true;
      const matchCat = catFilter ? r.cat === catFilter : true;
      return matchSearch && matchCat;
    })
    .sort((a, b) => {
      // Default view order: BIB ascending. Numeric compare so "2" sorts before
      // "10" (a plain string sort would put "10" first); fall back to a
      // string compare for any non-numeric bib (e.g. a stray test bib).
      const bibA = Number(a.bib);
      const bibB = Number(b.bib);
      if (!Number.isNaN(bibA) && !Number.isNaN(bibB)) return bibA - bibB;
      return String(a.bib ?? '').localeCompare(String(b.bib ?? ''));
    });

  const columns = [
    {
      key: 'actions',
      label: 'จัดการ',
      align: 'center',
      defaultWidth: 200,
      filterable: false,
      sortable: false,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button className="btn btn-sm" onClick={() => handleEdit(r)} style={{ padding: '2px 8px', fontSize: '12px' }}>✏️</button>
          <button className="btn btn-sm" onClick={() => handleDelete(r.id, r.name)} style={{ padding: '2px 8px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c' }}>🗑️</button>
        </div>
      )
    },
    { key: 'bib', label: 'BIB', defaultWidth: 200 },
    { key: 'name', label: 'Name', defaultWidth: 330 },
    {
      key: 'cat',
      label: 'Cat.',
      defaultWidth: 200,
      render: (val) => val ? (
        <span style={{ background: catColorMap[val] || '#3b82f6', color: '#fff', padding: '2px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>
          {val}
        </span>
      ) : null
    },
    { key: 'gender', label: 'Gen.', defaultWidth: 180 },
    {
      key: 'age_group',
      label: 'Age Group',
      defaultWidth: 200,
      valueGetter: (r) => r.age_group || r.age || '—',
      render: (val, r) => val || r.age_group || r.age || '—'
    },
    { key: 'nat', label: 'Nat.', defaultWidth: 180 },
    {
      key: 'status',
      label: 'Status',
      defaultWidth: 230,
      valueGetter: (r) => statusOf(r, stations).txt,
      render: (_, r) => {
        const s = statusOf(r, stations);
        return (
          <span className={`badge ${s.cls}`}>
            <span className="dot"></span>{s.txt}
          </span>
        );
      }
    }
  ];

  return (
    <div className="page active" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} /> Database
          </span>
          <h1 style={{ margin: '4px 0', fontSize: '24px', fontWeight: 700 }}>รายชื่อนักวิ่ง</h1>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-2)' }}>
            ฐานข้อมูลผู้สมัคร — ค้นหาจาก BIB หรือชื่อเพื่อตรวจสอบสถานะ
          </p>
        </div>

        {/* Action Button: Clear All Runners */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn btn-sm"
            onClick={() => fetchRunners()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}
          >
            <RefreshCw size={14} /> รีเฟรช
          </button>
          <button
            className="btn btn-sm"
            onClick={handleClearAllRunners}
            disabled={loading || runners.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: runners.length > 0 ? '#fee2e2' : 'var(--bg-soft)',
              color: runners.length > 0 ? '#b91c1c' : 'var(--ink-2)',
              borderColor: runners.length > 0 ? '#fca5a5' : 'var(--line)',
              fontWeight: 600,
              cursor: (loading || runners.length === 0) ? 'not-allowed' : 'pointer'
            }}
            title="ลบรายชื่อนักวิ่งทั้งหมดของงานที่เลือก"
          >
            <Trash2 size={15} /> ล้างรายชื่อทั้งหมด ({runners.length})
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-soft)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-2)' }}>งานวิ่ง:</span>
          <select
            className="search"
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setCatFilter('');
            }}
            style={{ width: '100%', padding: '8px 10px', fontSize: '13px' }}
          >
            {events.length === 0 && <option value="">ไม่มีงานวิ่ง</option>}
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>

        <input
          className="search"
          placeholder="🔍 ค้นหา BIB, ชื่อ-นามสกุล…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: '180px', flex: 1, padding: '8px 12px', fontSize: '13px' }}
        />

        <select
          className="search"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          style={{ width: '150px', padding: '8px 10px', fontSize: '13px' }}
        >
          <option value="">ทุกระยะ ({categories.length})</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ marginTop: '16px', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
        {loading ? (
          <div className="card card-pad empty" style={{ textAlign: 'center', padding: '3rem' }}>กำลังโหลดข้อมูล...</div>
        ) : (
          <AdvancedTable
            columns={columns}
            data={filtered}
            pageSize={100}
            maxHeight="600px"
          />
        )}
      </div>

      <EditRunnerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        runner={selectedRunner}
        existingRunners={runners}
        existingCategories={categories}
        catColorMap={catColorMap}
        onSave={handleSaveRunner}
        eventId={selectedEventId}
      />
    </div>
  );
}
