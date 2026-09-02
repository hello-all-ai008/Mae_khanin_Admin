import { useState, useEffect } from 'react';
import { useRace } from '../context/RaceContext';
import { supabase } from '../lib/supabaseClient';
import { assertWriteOk } from '../lib/supabaseResult';
import CategoriesSetup from '../components/event-setup/CategoriesSetup';
import LocationsSetup from '../components/event-setup/LocationsSetup';
import StationsSetup from '../components/event-setup/StationsSetup';
import CheckpointsSetup from '../components/event-setup/CheckpointsSetup';
import StaffSetup from '../components/event-setup/StaffSetup';
import { 
  Calendar, 
  MapPin, 
  Flag, 
  Layers, 
  Settings, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Search,
  Sparkles,
  ChevronRight,
  UserCheck
} from 'lucide-react';

export default function EventManager() {
  const { addToast, showConfirm, setSelectedEventId: setGlobalEventId } = useRace();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [eventSearch, setEventSearch] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    start_date: '',
    end_date: '',
    status: 'DRAFT'
  });

  // Fetch all events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      const loadedEvents = data || [];
      setEvents(loadedEvents);

      // Auto-select the first event if none is selected
      if (loadedEvents.length > 0 && !formData.id) {
        handleSelectEvent(loadedEvents[0], false);
      }
    } catch (err) {
      console.error('Fetch events error:', err);
      addToast(`ดึงข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectEvent = (evt, switchTab = false) => {
    setFormData({
      id: evt.id,
      name: evt.name,
      start_date: evt.start_date,
      end_date: evt.end_date,
      status: evt.status
    });
    if (setGlobalEventId) {
      setGlobalEventId(evt.id);
    }
    if (switchTab) {
      setActiveTab('info');
    }
  };

  const handleCreateNewClick = () => {
    setFormData({
      id: null,
      name: '',
      start_date: '',
      end_date: '',
      status: 'DRAFT'
    });
    setActiveTab('info');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.start_date || !formData.end_date) {
      addToast('กรุณากรอกข้อมูลสำคัญให้ครบถ้วน (ชื่อ, วันเริ่มต้น, วันสิ้นสุด)', true);
      return;
    }

    setIsSaving(true);
    try {
      if (formData.id) {
        // Update existing event
        // `.select('id')` so an RLS-filtered UPDATE (204, no error) is not reported as success.
        assertWriteOk(
          await supabase
            .from('events')
            .update({
              name: formData.name.trim(),
              start_date: formData.start_date,
              end_date: formData.end_date,
              status: formData.status
            })
            .eq('id', formData.id)
            .select('id')
        );
        addToast(`✓ อัปเดตข้อมูลงาน "${formData.name}" สำเร็จ!`, false);
      } else {
        // Insert new event
        const data = assertWriteOk(
          await supabase
            .from('events')
            .insert([{
              name: formData.name.trim(),
              start_date: formData.start_date,
              end_date: formData.end_date,
              status: formData.status
            }])
            .select('id, name, start_date, end_date, status')
            .single()
        );

        addToast(`✓ สร้างงานวิ่งใหม่ "${formData.name}" สำเร็จ!`, false);
        handleSelectEvent(data, false);
      }

      fetchEvents();
    } catch (err) {
      console.error('Save event error:', err);
      addToast(`บันทึกไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    const confirmed = await showConfirm(
      'ยืนยันการลบงานวิ่ง',
      `คุณต้องการลบงานวิ่ง "${name}" ใช่หรือไม่?\n⚠️ การลบจะทำให้ข้อมูลระยะทาง จุดตรวจ และนักวิ่งที่เกี่ยวข้องหายไปทั้งหมด!`
    );
    if (!confirmed) return;

    try {
      assertWriteOk(await supabase.from('events').delete().eq('id', id).select('id'));
      addToast(`✓ ลบงานวิ่ง "${name}" สำเร็จ`, false);
      
      if (formData.id === id) {
        handleCreateNewClick();
      }
      fetchEvents();
    } catch (err) {
      console.error('Delete event error:', err);
      addToast(`ลบข้อมูลไม่สำเร็จ: ${err.message}`, true);
    }
  };

  const filteredEvents = events.filter(e => 
    e.name.toLowerCase().includes(eventSearch.toLowerCase())
  );

  const activeEventObj = events.find(e => e.id === formData.id);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PUBLISHED':
        return <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>● เผยแพร่แล้ว</span>;
      case 'COMPLETED':
        return <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '12px', background: '#e2e8f0', color: '#475569', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>จบการแข่งขัน</span>;
      default:
        return <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '12px', background: '#fef9c3', color: '#854d0e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>ฉบับร่าง (Draft)</span>;
    }
  };

  return (
    <div className="page active" style={{ padding: '24px 32px', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      
      {/* ── Top Header & Global Event Switcher ── */}
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '1.25rem' }}>
        <div>
          <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={14} /> System Configuration
          </span>
          <h1 style={{ margin: '4px 0', fontSize: '24px', fontWeight: 700 }}>จัดการงานวิ่ง (Event Management)</h1>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-2)' }}>ตั้งค่างานวิ่ง กำหนดระยะทาง สถานที่ และผูกจุดเช็คพอยต์การแข่งขัน</p>
        </div>

        {/* Global Event Selector & Create New Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-soft)', padding: '6px 12px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-2)' }}>งานวิ่งที่เลือก:</span>
            <select 
              className="search" 
              style={{ width: '220px', padding: '6px 10px', fontSize: '13px', fontWeight: 600 }}
              value={formData.id || ''} 
              onChange={(e) => {
                const selectedId = e.target.value;
                if (!selectedId) {
                  handleCreateNewClick();
                } else {
                  const ev = events.find(item => item.id === selectedId);
                  if (ev) handleSelectEvent(ev, false);
                }
              }}
            >
              {events.length === 0 && <option value="">(ยังไม่มีงานวิ่ง)</option>}
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name} ({ev.status})</option>
              ))}
              <option value="">➕ [ สร้างงานวิ่งใหม่ ]</option>
            </select>
          </div>

          <button 
            className="btn" 
            onClick={handleCreateNewClick}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
          >
            <Plus size={16} /> สร้างงานใหม่
          </button>
        </div>
      </div>

      {/* ── Active Event Banner & Tabs Strip ── */}
      {formData.id ? (
        <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingBottom: '14px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700 }}>
                🏃
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{activeEventObj?.name || formData.name}</h2>
                  {getStatusBadge(activeEventObj?.status || formData.status)}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink-2)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} /> {formData.start_date || '—'} ถึง {formData.end_date || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-sm" 
                onClick={() => setActiveTab('info')}
                style={{ padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid var(--line)' }}
              >
                ✏️ แก้ไขข้อมูลงาน
              </button>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="event-mgr-tabs" style={{ display: 'flex', gap: '6px', paddingTop: '14px', flexWrap: 'wrap' }}>
            <button 
              className="btn" 
              onClick={() => setActiveTab('info')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', borderRadius: '8px', background: activeTab === 'info' ? '#f8fafc' : 'transparent', color: activeTab === 'info' ? '#0f172a' : '#64748b', border: `1px solid ${activeTab === 'info' ? '#cbd5e1' : 'transparent'}` }}
            >
              <Settings size={15} /> ข้อมูลทั่วไป (Info)
            </button>
            <button 
              className="btn" 
              onClick={() => setActiveTab('categories')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', borderRadius: '8px', background: activeTab === 'categories' ? '#f8fafc' : 'transparent', color: activeTab === 'categories' ? '#0f172a' : '#64748b', border: `1px solid ${activeTab === 'categories' ? '#cbd5e1' : 'transparent'}` }}
            >
              <Layers size={15} /> รุ่น/ระยะทาง (Categories)
            </button>
            <button 
              className="btn" 
              onClick={() => setActiveTab('locations')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', borderRadius: '8px', background: activeTab === 'locations' ? '#f8fafc' : 'transparent', color: activeTab === 'locations' ? '#0f172a' : '#64748b', border: `1px solid ${activeTab === 'locations' ? '#cbd5e1' : 'transparent'}` }}
            >
              <MapPin size={15} /> สถานที่ (Locations)
            </button>
            <button 
              className="btn" 
              onClick={() => setActiveTab('stations')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', borderRadius: '8px', background: activeTab === 'stations' ? '#f8fafc' : 'transparent', color: activeTab === 'stations' ? '#0f172a' : '#64748b', border: `1px solid ${activeTab === 'stations' ? '#cbd5e1' : 'transparent'}` }}
            >
              <Flag size={15} /> จุดตรวจ (Stations)
            </button>
            <button 
              className="btn" 
              onClick={() => setActiveTab('checkpoints')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', borderRadius: '8px', background: activeTab === 'checkpoints' ? '#f8fafc' : 'transparent', color: activeTab === 'checkpoints' ? '#0f172a' : '#64748b', border: `1px solid ${activeTab === 'checkpoints' ? '#cbd5e1' : 'transparent'}` }}
            >
              <Clock size={15} /> ผูกจุดตรวจและเวลา (Checkpoints)
            </button>
            <button 
              className="btn" 
              onClick={() => setActiveTab('staff')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', borderRadius: '8px', background: activeTab === 'staff' ? '#f8fafc' : 'transparent', color: activeTab === 'staff' ? '#0f172a' : '#64748b', border: `1px solid ${activeTab === 'staff' ? '#cbd5e1' : 'transparent'}` }}
            >
              <UserCheck size={15} /> เจ้าหน้าที่/คนสแกน (Staff)
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>✨</span>
            <div>
              <b style={{ color: '#92400e', fontSize: '15px' }}>โหมดสร้างงานวิ่งใหม่</b>
              <div style={{ fontSize: '13px', color: '#b45309' }}>กรุณากรอกข้อมูลพื้นฐานด้านล่างและบันทึก เพื่อเริ่มตั้งค่าระยะทางและจุดตรวจ</div>
            </div>
          </div>
          {events.length > 0 && (
            <button className="btn btn-sm" onClick={() => handleSelectEvent(events[0], false)} style={{ background: '#fff', border: '1px solid #fde68a' }}>
              ยกเลิก / เลือกงานที่มีอยู่
            </button>
          )}
        </div>
      )}

      {/* ── TAB 1: General Info & Events Directory ── */}
      {activeTab === 'info' && (
        <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.3fr)', gap: '24px', alignItems: 'start' }}>
          
          {/* Left: Event Form Card */}
          <div className="card card-pad event-setup-card" style={{ background: formData.id ? '#fff' : 'var(--bg-soft)', border: formData.id ? '2px solid var(--ink)' : '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {formData.id ? <><Edit3 size={18} /> แก้ไขข้อมูลงานวิ่ง</> : <><Sparkles size={18} /> สร้างงานวิ่งใหม่</>}
              </h2>
              {formData.id && (
                <span style={{ fontSize: '12px', background: 'var(--bg-soft)', padding: '3px 8px', borderRadius: '8px', color: 'var(--ink-2)' }}>
                  ID: {formData.id.slice(0, 8)}...
                </span>
              )}
            </div>
            
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                  ชื่องานวิ่ง (Event Name) <span style={{ color: 'var(--warn)' }}>*</span>
                </label>
                <input 
                  type="text" 
                  className="search" 
                  name="name" 
                  value={formData.name} 
                  onChange={handleInputChange} 
                  placeholder="เช่น Baanpong Trail 2026" 
                  required 
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.95rem' }} 
                />
              </div>
              
              <div className="form-row-2">
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                    วันเริ่มต้น (Start Date) <span style={{ color: 'var(--warn)' }}>*</span>
                  </label>
                  <input 
                    type="date" 
                    className="search" 
                    name="start_date" 
                    value={formData.start_date} 
                    onChange={handleInputChange} 
                    required 
                    style={{ width: '100%', padding: '9px 12px' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                    วันสิ้นสุด (End Date) <span style={{ color: 'var(--warn)' }}>*</span>
                  </label>
                  <input 
                    type="date" 
                    className="search" 
                    name="end_date" 
                    value={formData.end_date} 
                    onChange={handleInputChange} 
                    required 
                    style={{ width: '100%', padding: '9px 12px' }} 
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                  สถานะการเผยแพร่ (Status) <span style={{ color: 'var(--warn)' }}>*</span>
                </label>
                <select 
                  className="search" 
                  name="status" 
                  value={formData.status} 
                  onChange={handleInputChange} 
                  required 
                  style={{ width: '100%', padding: '9px 12px' }}
                >
                  <option value="DRAFT">DRAFT (ฉบับร่าง / ซ่อนอยู่)</option>
                  <option value="PUBLISHED">PUBLISHED (เผยแพร่ / กำลังใช้งาน)</option>
                  <option value="COMPLETED">COMPLETED (จบการแข่งขันแล้ว)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="submit" 
                  className="btn" 
                  disabled={isSaving}
                  style={{ flex: 1, padding: '11px', fontSize: '0.95rem', fontWeight: 600, background: '#2563eb', borderColor: '#2563eb', color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer' }}
                >
                  {isSaving ? 'กำลังบันทึก...' : (formData.id ? '💾 บันทึกการแก้ไข' : '➕ สร้างงานวิ่ง')}
                </button>
                
                {formData.id && (
                  <>
                    <button 
                      type="button" 
                      className="btn" 
                      onClick={() => handleDelete(formData.id, formData.name)}
                      style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '11px 16px', fontWeight: 600, cursor: 'pointer' }}
                      title="ลบงานวิ่งนี้"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button 
                      type="button" 
                      className="btn" 
                      onClick={handleCreateNewClick}
                      style={{ border: '1px solid var(--line)', background: '#fff', padding: '11px 14px' }}
                      title="ยกเลิก / สร้างงานใหม่"
                    >
                      ยกเลิก
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>

          {/* Right: All Events List Card */}
          <div className="card card-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '17px', margin: 0, fontWeight: 700 }}>รายชื่องานวิ่งทั้งหมด ({events.length})</h2>
                <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>คลิกที่งานเพื่อเลือกจัดการ</span>
              </div>
              <button className="btn btn-sm" onClick={fetchEvents} style={{ padding: '5px 10px', fontSize: '12px', background: 'var(--bg-soft)', color: 'black', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCw size={13} /> รีเฟรช
              </button>
            </div>

            {/* Event Search Input */}
            <div style={{ marginBottom: '14px', position: 'relative' }}>
              <input 
                type="text" 
                className="search" 
                placeholder="🔍 ค้นหาชื่องานวิ่ง..." 
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
              />
            </div>

            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--ink-2)' }}>
                กำลังโหลดข้อมูลงานวิ่ง...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--ink-2)', border: '2px dashed var(--line)', borderRadius: '10px' }}>
                ไม่พบงานวิ่งที่ค้นหา
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {filteredEvents.map(evt => {
                  const isSelected = formData.id === evt.id;
                  return (
                    <div 
                      key={evt.id} 
                      onClick={() => handleSelectEvent(evt, false)}
                      style={{ 
                        border: `1.5px solid ${isSelected ? 'var(--ink)' : 'var(--line)'}`, 
                        borderRadius: '10px', 
                        padding: '14px 16px',
                        background: isSelected ? 'var(--bg-soft)' : '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease-in-out',
                        boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.06)' : 'none'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: isSelected ? 700 : 600, color: 'var(--ink)' }}>
                            {evt.name}
                          </h3>
                          {getStatusBadge(evt.status)}
                          {isSelected && (
                            <span style={{ fontSize: '10px', background: 'var(--ink)', color: '#fff', padding: '1px 6px', borderRadius: '6px', fontWeight: 600 }}>
                              Active
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={12} /> {evt.start_date} ~ {evt.end_date}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleSelectEvent(evt, false); }}
                          className={`btn btn-sm ${isSelected ? 'btn-dark' : ''}`}
                          style={{ padding: '5px 12px', fontSize: '12px' }}
                        >
                          {isSelected ? 'กำลังเลือก' : 'เลือก'}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(evt.id, evt.name); }}
                          className="btn btn-sm"
                          style={{ padding: '5px 10px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
                          title="ลบงานนี้"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sub-Setup Tabs (Categories, Locations, Stations, Checkpoints, Staff) ── */}
      {formData.id && (
        <div style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
          {activeTab === 'categories' && <CategoriesSetup eventId={formData.id} />}
          {activeTab === 'locations' && <LocationsSetup eventId={formData.id} />}
          {activeTab === 'stations' && <StationsSetup eventId={formData.id} />}
          {activeTab === 'checkpoints' && <CheckpointsSetup eventId={formData.id} />}
          {activeTab === 'staff' && <StaffSetup eventId={formData.id} />}
        </div>
      )}

    </div>
  );
}
