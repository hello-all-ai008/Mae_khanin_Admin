import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRace } from '../context/RaceContext';
import AdvancedTable from '../components/AdvancedTable';
import EditRunnerModal from '../components/EditRunnerModal';
import { Trash2, RefreshCw, Users } from 'lucide-react';

export default function RunnersList() {
  const { addToast, showConfirm } = useRace();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  const [categories, setCategories] = useState([]);
  const [runners, setRunners] = useState([]);

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

  const fetchRunners = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const { data: runData, error } = await supabase
        .from('runners')
        .select('*')
        .eq('event_id', selectedEventId);

      if (error) throw error;
      if (runData) {
        setRunners(runData);
        const uniqueCats = [...new Set(runData.map(r => r.cat).filter(Boolean))].sort();
        setCategories(uniqueCats);
      }
    } catch (err) {
      console.error('Fetch runners error:', err);
      addToast(`ดึงข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Categories & Runners on Event change
  useEffect(() => {
    fetchRunners();
  }, [selectedEventId]);

  const handleEdit = (runner) => {
    setSelectedRunner(runner);
    setIsEditModalOpen(true);
  };

  const handleSaveRunner = (updatedRunner) => {
    setRunners(prev => prev.map(r => r.id === updatedRunner.id ? updatedRunner : r));
    addToast('อัปเดตข้อมูลนักวิ่งสำเร็จ', false);
  };

  const handleDelete = async (id, name) => {
    const confirmed = await showConfirm('ยืนยันการลบ', `คุณต้องการลบข้อมูลของ ${name} ใช่หรือไม่?`);
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('runners').delete().eq('id', id);
      if (error) throw error;
      setRunners(prev => prev.filter(r => r.id !== id));
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
      const { error } = await supabase
        .from('runners')
        .delete()
        .eq('event_id', selectedEventId);

      if (error) throw error;

      setRunners([]);
      setCategories([]);
      addToast(`✓ ล้างรายชื่อนักวิ่งทั้งหมด (${runners.length} คน) เรียบร้อยแล้ว`, false);
    } catch (err) {
      console.error('Clear runners error:', err);
      addToast(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  const statusOf = (r) => {
    if (r.finish) return { cls: 'b-fin', txt: 'Finished' };
    if (r.checkin) return { cls: 'b-start', txt: 'Checked-in' };
    if (r.registration_status) return { cls: 'b-reg', txt: r.registration_status };
    return { cls: 'b-reg', txt: 'Registered' };
  };

  const filtered = runners.filter(r => {
    const matchSearch = search ? (r.bib?.includes(search) || r.name?.toLowerCase().includes(search.toLowerCase())) : true;
    const matchCat = catFilter ? r.cat === catFilter : true;
    return matchSearch && matchCat;
  });

  const columns = [
    { key: 'bib', label: 'BIB', defaultWidth: 120 },
    { key: 'name', label: 'Name', defaultWidth: 250 },
    { key: 'cat', label: 'Cat.', defaultWidth: 120 },
    { key: 'gender', label: 'Gen.', defaultWidth: 100 },
    { key: 'age', label: 'Age', defaultWidth: 100 },
    { key: 'nat', label: 'Nat.', defaultWidth: 100 },
    {
      key: 'status',
      label: 'Status',
      defaultWidth: 150,
      render: (_, r) => {
        const s = statusOf(r);
        return (
          <span className={`badge ${s.cls}`}>
            <span className="dot"></span>{s.txt}
          </span>
        );
      }
    },
    {
      key: 'actions',
      label: 'จัดการ',
      align: 'center',
      defaultWidth: 120,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button className="btn btn-sm" onClick={() => handleEdit(r)} style={{ padding: '2px 8px', fontSize: '12px' }}>✏️</button>
          <button className="btn btn-sm" onClick={() => handleDelete(r.id, r.name)} style={{ padding: '2px 8px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c' }}>🗑️</button>
        </div>
      )
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
            onClick={fetchRunners}
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
        onSave={handleSaveRunner}
        eventId={selectedEventId}
      />
    </div>
  );
}
