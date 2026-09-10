import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchAllRows } from '../lib/supabaseFetch';
import { assertWriteOk } from '../lib/supabaseResult';
import { useRace } from '../context/RaceContext';
import RunnerTimingModal from '../components/RunnerTimingModal';
import {
  RotateCcw,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Flag,
  AlertTriangle,
  SlidersHorizontal,
  ShieldAlert
} from 'lucide-react';

export default function RunnerProgressControl() {
  const { addToast, currentOperator, preloadEventData, updateRunner } = useRace();
  const addToastRef = useRef(addToast);
  useEffect(() => {
    addToastRef.current = addToast;
  });

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [categories, setCategories] = useState([]);
  const [stations, setStations] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [runners, setRunners] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, DNS, IN_RACE, FINISHED, DNF
  const [selectedBibs, setSelectedBibs] = useState(new Set());

  // Modal State
  const [selectedRunner, setSelectedRunner] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Reset Confirm Modal
  const [confirmResetType, setConfirmResetType] = useState(null); // 'ALL', 'CATEGORY', 'SELECTED'
  const [isResetting, setIsResetting] = useState(false);

  // 1. Fetch Events
  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase
        .from('events')
        .select('id, name, start_date')
        .order('start_date', { ascending: false });

      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
    }
    fetchEvents();
  }, []);

  // 2. Fetch Event Data (Categories, Stations, Checkpoints, Runners)
  const fetchData = useCallback(async (silent = false) => {
    if (!selectedEventId) return;
    if (!silent) setLoading(true);

    try {
      // Fetch Categories
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('distance_km', { ascending: true });
      if (catError) console.warn('Categories error:', catError);
      setCategories(catData || []);

      // Fetch Stations
      const { data: stData, error: stError } = await supabase
        .from('stations')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('sequence_order', { ascending: true });
      if (stError) console.warn('Stations error:', stError);
      setStations(stData || []);

      // Fetch Checkpoint route definitions
      const { data: cpData, error: cpError } = await supabase
        .from('checkpoint')
        .select(`
          id, category_id, station_id, sequence_order, cutoff_time,
          stations ( id, name, type, sequence_order )
        `)
        .order('sequence_order', { ascending: true });
      if (cpError) console.warn('Checkpoint error:', cpError);
      setCheckpoints(cpData || []);

      // Fetch Runners (using fetchAllRows to bypass 1000-row cap)
      const { data: runData, error: runError } = await fetchAllRows((from, to) =>
        supabase
          .from('runners')
          .select('*')
          .eq('event_id', selectedEventId)
          .order('bib', { ascending: true })
          .range(from, to)
      );
      if (runError) throw runError;
      setRunners(runData || []);
      setSelectedBibs(new Set());
    } catch (err) {
      console.error('Fetch error in RunnerProgressControl:', err);
      addToastRef.current?.(`ดึงข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Map category ID or name -> ordered checkpoints
  const categoryRoutesMap = useMemo(() => {
    const map = new Map();

    categories.forEach(cat => {
      const catCps = (checkpoints || [])
        .filter(cp => cp.category_id === cat.id)
        .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));

      const route = catCps.map(cp => {
        const st = Array.isArray(cp.stations) ? cp.stations[0] : (cp.stations || {});
        return {
          id: cp.station_id || st.id,
          name: st.name || `Checkpoint ${cp.sequence_order}`,
          type: st.type || 'CP',
          sequence_order: cp.sequence_order,
          cutoff_time: cp.cutoff_time
        };
      });

      map.set(cat.id, route);
      if (cat.name) map.set(cat.name.trim().toLowerCase(), route);
    });

    return map;
  }, [categories, checkpoints]);

  // Map category ID or name -> ordered RAW checkpoint rows (unflattened, for RunnerTimingModal)
  const rawCheckpointsByCategory = useMemo(() => {
    const map = new Map();
    categories.forEach(cat => {
      const rows = (checkpoints || [])
        .filter(cp => cp.category_id === cat.id)
        .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
      map.set(cat.id, rows);
      if (cat.name) map.set(cat.name.trim().toLowerCase(), rows);
    });
    return map;
  }, [categories, checkpoints]);

  // Helper to determine runner's status
  const getRunnerStatus = useCallback((r) => {
    if (r.race_status === 'DNF') return 'DNF';
    if (r.race_status === 'DNS') return 'DNS';
    if (r.finish) return 'FINISHED';
    const hasStarted = Boolean(r.checked_in_at || r.registration_status === 'CHECKED_IN' || (r.cps && Object.keys(r.cps).length > 0));
    if (!hasStarted) return 'DNS';
    return 'IN_RACE';
  }, []);

  // Format timestamp helper
  const formatTimeStr = (epochOrIso) => {
    if (!epochOrIso) return null;
    try {
      const d = typeof epochOrIso === 'number' ? new Date(epochOrIso) : new Date(epochOrIso);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return null;
    }
  };

  // Filtered runners
  const filteredRunners = useMemo(() => {
    return runners.filter(r => {
      // Search
      const bib = String(r.bib || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      const q = search.trim().toLowerCase();
      if (q && !bib.includes(q) && !name.includes(q)) return false;

      // Category filter
      if (categoryFilter !== 'ALL') {
        const rCat = (r.cat || r.category_id || '').toLowerCase();
        if (!rCat.includes(categoryFilter.toLowerCase())) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        const st = getRunnerStatus(r);
        if (st !== statusFilter) return false;
      }

      return true;
    });
  }, [runners, search, categoryFilter, statusFilter, getRunnerStatus]);

  // Statistics — scoped to the selected ระยะ (categoryFilter) so the summary
  // cards reflect that distance's numbers instead of always the whole event.
  // Deliberately ignores the search box / status filter — those would make a
  // "summary" nonsensical (e.g. filtering to DNF would zero out every other
  // stat).
  const statsRunners = useMemo(() => {
    if (categoryFilter === 'ALL') return runners;
    return runners.filter(r => {
      const rCat = (r.cat || r.category_id || '').toLowerCase();
      return rCat.includes(categoryFilter.toLowerCase());
    });
  }, [runners, categoryFilter]);

  const stats = useMemo(() => {
    let finished = 0;
    let inRace = 0;
    let dnf = 0;
    let dns = 0;

    statsRunners.forEach(r => {
      const st = getRunnerStatus(r);
      if (st === 'FINISHED') finished++;
      else if (st === 'IN_RACE') inRace++;
      else if (st === 'DNF') dnf++;
      else if (st === 'DNS') dns++;
    });

    return { total: statsRunners.length, finished, inRace, dnf, dns };
  }, [statsRunners, getRunnerStatus]);

  // Select all visible runners
  const handleToggleSelectAll = () => {
    if (selectedBibs.size === filteredRunners.length && filteredRunners.length > 0) {
      setSelectedBibs(new Set());
    } else {
      setSelectedBibs(new Set(filteredRunners.map(r => r.id)));
    }
  };

  const handleToggleSelectRunner = (id) => {
    setSelectedBibs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Open Edit Timing Modal
  const handleOpenTimingModal = (runner) => {
    setSelectedRunner(runner);
    setIsModalOpen(true);
  };

  // Quick Action: Single Runner Reset
  const handleQuickReset = async (runner) => {
    if (!window.confirm(`ยืนยันการรีเซ็ตข้อมูลสแกนทั้งหมดของ BIB ${runner.bib}?`)) return;

    try {
      const payload = {
        registration_status: 'PRE_REGISTERED',
        checked_in_at: null,
        checked_in_by: null,
        cps: {},
        finish: null,
        race_status: null,
        race_status_at: null,
        race_status_by: null,
        updated_at: new Date().toISOString()
      };

      assertWriteOk(
        await supabase
          .from('runners')
          .update(payload)
          .eq('id', runner.id)
          .select('id')
      );

      setRunners(prev => prev.map(r => r.id === runner.id ? { ...r, ...payload } : r));
      if (typeof updateRunner === 'function') {
        updateRunner({ id: runner.id, bib: runner.bib, ...payload });
      }
      addToastRef.current?.(`รีเซ็ตข้อมูล BIB ${runner.bib} เรียบร้อย`);
    } catch (err) {
      console.error(err);
      addToastRef.current?.(`รีเซ็ตไม่สำเร็จ: ${err.message}`, true);
    }
  };

  // Quick Action: Mark DNS
  const handleQuickDns = async (runner) => {
    const isCurrentlyDns = runner.race_status === 'DNS';
    const willClearFinish = !isCurrentlyDns && runner.finish;
    const confirmMsg = isCurrentlyDns
      ? `ยกเลิกสถานะ DNS ของ BIB ${runner.bib}?`
      : willClearFinish
        ? `BIB ${runner.bib} มีเวลาเข้าเส้นชัยอยู่แล้ว การตั้งเป็น DNS จะล้างเวลาเข้าเส้นชัยทิ้ง ยืนยันหรือไม่?`
        : `ตั้งค่า BIB ${runner.bib} เป็น DNS (ไม่ได้เริ่มแข่งขัน)?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const payload = isCurrentlyDns
        ? {
            race_status: null,
            race_status_at: null,
            race_status_by: null,
            updated_at: new Date().toISOString()
          }
        : {
            race_status: 'DNS',
            race_status_at: new Date().toISOString(),
            race_status_by: currentOperator || 'Staff',
            finish: null,
            updated_at: new Date().toISOString()
          };

      assertWriteOk(
        await supabase
          .from('runners')
          .update(payload)
          .eq('id', runner.id)
          .select('id')
      );

      setRunners(prev => prev.map(r => r.id === runner.id ? { ...r, ...payload } : r));
      if (typeof updateRunner === 'function') {
        updateRunner({ id: runner.id, bib: runner.bib, ...payload });
      }
      addToastRef.current?.(isCurrentlyDns ? `ยกเลิก DNS ของ BIB ${runner.bib} แล้ว` : `ตั้งค่า BIB ${runner.bib} เป็น DNS แล้ว`);
    } catch (err) {
      console.error(err);
      addToastRef.current?.(`ตั้งค่า DNS ไม่สำเร็จ: ${err.message}`, true);
    }
  };

  // Quick Action: Mark DNF
  const handleQuickDnf = async (runner) => {
    const isCurrentlyDnf = runner.race_status === 'DNF';
    const willClearFinish = !isCurrentlyDnf && runner.finish;
    const confirmMsg = isCurrentlyDnf
      ? `ยกเลิกสถานะ DNF ของ BIB ${runner.bib}?`
      : willClearFinish
        ? `BIB ${runner.bib} มีเวลาเข้าเส้นชัยอยู่แล้ว การตั้งเป็น DNF จะล้างเวลาเข้าเส้นชัยทิ้งอย่างถาวร ยืนยันหรือไม่?`
        : `ตั้งค่า BIB ${runner.bib} เป็น DNF (ไม่จบการแข่งขัน)?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const payload = {
        race_status: isCurrentlyDnf ? null : 'DNF',
        race_status_at: isCurrentlyDnf ? null : new Date().toISOString(),
        race_status_by: isCurrentlyDnf ? null : (currentOperator || 'Staff'),
        finish: isCurrentlyDnf ? runner.finish : null,
        updated_at: new Date().toISOString()
      };

      assertWriteOk(
        await supabase
          .from('runners')
          .update(payload)
          .eq('id', runner.id)
          .select('id')
      );

      setRunners(prev => prev.map(r => r.id === runner.id ? { ...r, ...payload } : r));
      if (typeof updateRunner === 'function') {
        updateRunner({ id: runner.id, bib: runner.bib, ...payload });
      }
      addToastRef.current?.(isCurrentlyDnf ? `ยกเลิก DNF ของ BIB ${runner.bib} แล้ว` : `บันทึก BIB ${runner.bib} เป็น DNF แล้ว`);
    } catch (err) {
      console.error(err);
      addToastRef.current?.(`บันทึกสถานะไม่สำเร็จ: ${err.message}`, true);
    }
  };

  // Bulk / Admin Reset Execution
  const executeReset = async () => {
    if (!confirmResetType || !selectedEventId) return;
    setIsResetting(true);

    try {
      const resetPayload = {
        registration_status: 'PRE_REGISTERED',
        checked_in_at: null,
        checked_in_by: null,
        cps: {},
        finish: null,
        race_status: null,
        race_status_at: null,
        race_status_by: null,
        updated_at: new Date().toISOString()
      };

      let query = supabase.from('runners').update(resetPayload).eq('event_id', selectedEventId);

      if (confirmResetType === 'CATEGORY') {
        if (categoryFilter === 'ALL') {
          alert('กรุณาเลือกระยะ/รุ่นที่ต้องการรีเซ็ตก่อน');
          setIsResetting(false);
          return;
        }
        query = query.ilike('cat', `%${categoryFilter}%`);
      } else if (confirmResetType === 'SELECTED') {
        if (selectedBibs.size === 0) {
          alert('กรุณาเลือกนักวิ่งอย่างน้อย 1 คน');
          setIsResetting(false);
          return;
        }
        query = query.in('id', Array.from(selectedBibs));
      }

      const { error } = await query;
      if (error) throw error;

      addToastRef.current?.('✅ รีเซ็ตข้อมูลสำเร็จเรียบร้อย');
      setConfirmResetType(null);
      if (preloadEventData && selectedEventId) {
        try {
          await preloadEventData(selectedEventId, true);
        } catch (preloadErr) {
          console.warn('Preload sync after reset warning:', preloadErr);
        }
      }
      await fetchData(false);
    } catch (err) {
      console.error('Reset execution failed:', err);
      addToastRef.current?.(`รีเซ็ตข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="page active" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      
      {/* ── Page Header ── */}
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 700 }}>
            <SlidersHorizontal size={14} /> Admin Test & Timing Control
          </span>
          <h1 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 800 }}>
            จัดการเวลา & จุดตรวจนักวิ่ง
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            แก้ไขเวลา Check-in, จุดตรวจ Station, เส้นชัย, กำหนดสถานะ DNS/DNF และรีเซ็ตข้อมูลเพื่อทดสอบระบบก่อนเริ่มการแข่งขันจริง
          </p>
        </div>

        {/* Event Selector & Refresh */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              fontWeight: 600,
              background: '#ffffff',
              color: '#0f172a',
              cursor: 'pointer'
            }}
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          <button
            className="btn btn-sm"
            onClick={() => fetchData()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            {loading ? 'กำลังดึงข้อมูล…' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {/* ── Summary Stats Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>นักวิ่งทั้งหมด</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{stats.total}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb' }}>กำลังแข่งขัน (In Race)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>{stats.inRace}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a' }}>จบการแข่งขัน (Finished)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>{stats.finished}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#ea580c' }}>ไม่จบการแข่งขัน (DNF)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#ea580c', marginTop: '4px' }}>{stats.dnf}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>ยังไม่เริ่ม (DNS)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#64748b', marginTop: '4px' }}>{stats.dns}</div>
        </div>
      </div>

      {/* ── Admin Test & Reset Action Bar ── */}
      <div style={{
        background: '#fff1f2',
        border: '1px solid #fecdd3',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={22} color="#e11d48" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#9f1239' }}>
              เครื่องมือทดสอบระบบ & รีเซ็ตข้อมูล (Test & Reset Tool)
            </div>
            <div style={{ fontSize: '12px', color: '#be123c' }}>
              ใช้สำหรับจำลองการแข่งขัน หรือล้างข้อมูลสแกนเพื่อเริ่มทดสอบใหม่ (คืนค่าเป็น PRE_REGISTERED)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {selectedBibs.size > 0 && (
            <button
              onClick={() => setConfirmResetType('SELECTED')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #f43f5e',
                background: '#ffffff',
                color: '#e11d48',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} /> รีเซ็ต {selectedBibs.size} คนที่เลือก
            </button>
          )}

          {categoryFilter !== 'ALL' && (
            <button
              onClick={() => setConfirmResetType('CATEGORY')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #f43f5e',
                background: '#ffffff',
                color: '#e11d48',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} /> รีเซ็ตระยะ {categoryFilter} ทั้งหมด
            </button>
          )}

          <button
            onClick={() => setConfirmResetType('ALL')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#e11d48',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(225, 29, 72, 0.2)'
            }}
          >
            <RotateCcw size={14} /> รีเซ็ตทั้งงานวิ่ง (Reset All)
          </button>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px', maxWidth: '380px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '8px 12px',
            width: '100%',
            background: '#ffffff'
          }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="ค้นหา BIB หรือ ชื่อนักวิ่ง..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Dropdowns for Distance & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="#64748b" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>ระยะ:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            >
              <option value="ALL">ทั้งหมด</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name} ({c.distance_km} {c.unit || 'km'})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>สถานะ:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            >
              <option value="ALL">ทั้งหมด ({stats.total})</option>
              <option value="IN_RACE">กำลังแข่งขัน ({stats.inRace})</option>
              <option value="FINISHED">เข้าเส้นชัยแล้ว ({stats.finished})</option>
              <option value="DNF">DNF ไม่จบการแข่งขัน ({stats.dnf})</option>
              <option value="DNS">DNS ยังไม่เริ่ม ({stats.dns})</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Runners Table ── */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px 14px', width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedBibs.size === filteredRunners.length && filteredRunners.length > 0}
                    onChange={handleToggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '12px 14px', width: '80px' }}>BIB</th>
                <th style={{ padding: '12px 14px', minWidth: '160px' }}>ชื่อ - นามสกุล</th>
                <th style={{ padding: '12px 14px', width: '90px' }}>ระยะ</th>
                <th style={{ padding: '12px 14px', width: '110px' }}>Check-in</th>
                <th style={{ padding: '12px 14px', minWidth: '220px' }}>จุดตรวจตามเส้นทาง (Stations Route)</th>
                <th style={{ padding: '12px 14px', width: '110px' }}>เส้นชัย</th>
                <th style={{ padding: '12px 14px', width: '110px' }}>สถานะ</th>
                <th style={{ padding: '12px 14px', width: '220px', textAlign: 'center' }}>จัดการเวลา & จุดตรวจ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRunners.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    {loading ? 'กำลังโหลดข้อมูลนักวิ่ง…' : 'ไม่พบข้อมูลนักวิ่งตามเงื่อนไขที่ค้นหา'}
                  </td>
                </tr>
              ) : (
                filteredRunners.map((runner) => {
                  const rStatus = getRunnerStatus(runner);
                  const isCheckedIn = Boolean(runner.checked_in_at || runner.registration_status === 'CHECKED_IN');
                  const checkinTime = formatTimeStr(runner.checked_in_at);
                  const finishTime = formatTimeStr(runner.finish);

                  // Determine this runner's route stations
                  const catKey = (runner.cat || '').trim().toLowerCase();
                  const runnerRoute = categoryRoutesMap.get(catKey) || categoryRoutesMap.get(runner.category_id) || [];
                  const catObj = categories.find(c => c.id === runner.category_id || c.name === runner.cat);
                  const catColor = catObj?.color || '#3b82f6';

                  return (
                    <tr
                      key={runner.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: selectedBibs.has(runner.id) ? '#eff6ff' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedBibs.has(runner.id)}
                          onChange={() => handleToggleSelectRunner(runner.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>

                      {/* BIB */}
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                        {runner.bib}
                      </td>

                      {/* Name */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{runner.name || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{runner.gender || ''} {runner.age ? `| ${runner.age} ปี` : ''}</div>
                      </td>

                      {/* Distance */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: catColor,
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '12px'
                        }}>
                          {runner.cat || runner.distance || '—'}
                        </span>
                      </td>

                      {/* Check-in */}
                      <td style={{ padding: '10px 14px' }}>
                        {isCheckedIn ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#16a34a',
                            fontWeight: 600,
                            fontSize: '12px'
                          }}>
                            <CheckCircle2 size={13} /> {checkinTime || 'เช็คอินแล้ว'}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                        )}
                      </td>

                      {/* Category Stations Route */}
                      <td style={{ padding: '10px 14px' }}>
                        {runnerRoute.length === 0 ? (
                          <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                            {runner.cps && Object.keys(runner.cps).length > 0
                              ? `สแกนแล้ว ${Object.keys(runner.cps).length} จุด`
                              : 'ไม่มีจุดตรวจผูกไว้'}
                          </span>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {runnerRoute.map((st, i) => {
                              const scanTime = runner.cps?.[st.id];
                              const isScanned = scanTime != null;
                              const timeStr = formatTimeStr(scanTime);

                              return (
                                <span
                                  key={st.id || i}
                                  title={`${st.name} ${timeStr ? `(${timeStr})` : '(ยังไม่สแกน)'}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: isScanned ? '#dbeafe' : '#f1f5f9',
                                    color: isScanned ? '#1d4ed8' : '#94a3b8',
                                    border: `1px solid ${isScanned ? '#93c5fd' : '#e2e8f0'}`
                                  }}
                                >
                                  {isScanned ? '✓ ' : ''}{st.name}
                                  {timeStr && <span style={{ fontSize: '10px', opacity: 0.85 }}>({timeStr.slice(0, 5)})</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* Finish */}
                      <td style={{ padding: '10px 14px' }}>
                        {finishTime ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#7c3aed',
                            fontWeight: 700,
                            fontSize: '12px'
                          }}>
                            <Flag size={13} /> {finishTime}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 14px' }}>
                        {rStatus === 'FINISHED' && (
                          <span className="badge b-fin" style={{ fontSize: '11px' }}>
                            <span className="dot"></span>Finished
                          </span>
                        )}
                        {rStatus === 'IN_RACE' && (
                          <span className="badge b-cp" style={{ fontSize: '11px' }}>
                            <span className="dot"></span>In Race
                          </span>
                        )}
                        {rStatus === 'DNF' && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#ffedd5',
                            color: '#c2410c',
                            fontWeight: 700,
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            border: '1px solid #fed7aa'
                          }}>
                            <AlertTriangle size={11} /> DNF
                          </span>
                        )}
                        {rStatus === 'DNS' && (
                          <span className="badge b-reg" style={{ fontSize: '11px' }}>
                            <span className="dot"></span>DNS
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleOpenTimingModal(runner)}
                            title="จัดการเวลา & จุดตรวจ"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #2563eb',
                              background: '#2563eb',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <Clock size={13} /> จัดการเวลา
                          </button>

                          <button
                            onClick={() => handleQuickDnf(runner)}
                            title={rStatus === 'DNF' ? 'ยกเลิก DNF' : 'ตั้งเป็น DNF'}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #fed7aa',
                              background: rStatus === 'DNF' ? '#ea580c' : '#ffedd5',
                              color: rStatus === 'DNF' ? '#ffffff' : '#c2410c',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            DNF
                          </button>

                          <button
                            onClick={() => handleQuickDns(runner)}
                            title="ตั้งเป็น DNS"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#64748b',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            DNS
                          </button>

                          <button
                            onClick={() => handleQuickReset(runner)}
                            title="รีเซ็ตสถานะนักวิ่งคนนี้"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #fecdd3',
                              background: '#fff1f2',
                              color: '#e11d48',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Runner Timing Modal ── */}
      {isModalOpen && selectedRunner && (
        <RunnerTimingModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedRunner(null);
          }}
          runner={selectedRunner}
          categoryCheckpoints={rawCheckpointsByCategory.get((selectedRunner.cat || '').trim().toLowerCase()) || rawCheckpointsByCategory.get(selectedRunner.category_id) || []}
          allStations={stations}
          onSaved={(updated) => {
            setRunners(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
            addToastRef.current?.(`บันทึกเวลาของ BIB ${updated.bib} เรียบร้อยแล้ว`);
          }}
        />
      )}

      {/* ── Confirm Bulk Reset Modal ── */}
      {confirmResetType && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            maxWidth: '500px',
            width: '100%',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            border: '1px solid #fecdd3'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#e11d48'
              }}>
                <ShieldAlert size={22} />
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#9f1239' }}>
                ยืนยันการรีเซ็ตข้อมูลสำหรับทดสอบระบบ
              </h3>
            </div>

            <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6, marginBottom: '20px' }}>
              {confirmResetType === 'ALL' && (
                <>⚠️ คุณกำลังจะ <strong>ล้างเวลา Check-in, จุดตรวจ Station และเส้นชัยทั้งหมด</strong> ของนักวิ่งทุกคนในงานวิ่งนี้ เพื่อเตรียมความพร้อมสำหรับการทดสอบระบบใหม่ ข้อมูลสแกนจะถูกรีเซ็ตกลับเป็นสถานะตั้งต้น (PRE_REGISTERED)</>
              )}
              {confirmResetType === 'CATEGORY' && (
                <>⚠️ คุณกำลังจะล้างข้อมูลสแกนทั้งหมดของนักวิ่งในระยะ <strong>{categoryFilter}</strong></>
              )}
              {confirmResetType === 'SELECTED' && (
                <>⚠️ คุณกำลังจะล้างข้อมูลสแกนของนักวิ่งจำนวน <strong>{selectedBibs.size} คน</strong> ที่เลือกไว้</>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setConfirmResetType(null)}
                disabled={isResetting}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={executeReset}
                disabled={isResetting}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#e11d48',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: isResetting ? 'not-allowed' : 'pointer'
                }}
              >
                {isResetting ? 'กำลังรีเซ็ต…' : 'ยืนยันการรีเซ็ต'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
