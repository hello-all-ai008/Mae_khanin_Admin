import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { assertWriteOk } from '../../lib/supabaseResult';
import { useRace } from '../../context/RaceContext';
import AdvancedTable from '../AdvancedTable';
import { 
  UserCheck, 
  UserPlus, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  Flag, 
  CheckCircle2, 
  XCircle, 
  Sparkles,
  Phone,
  Search,
  Filter
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'MARSHAL', label: '🚩 Marshal ประจำจุดตรวจ (Check Point)', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'CHECKIN_CREW', label: '🟢 เจ้าหน้าที่จุดสตาร์ท / Check-in', color: '#10b981', bg: '#ecfdf5' },
  { value: 'FINISH_JUDGE', label: '🏁 กรรมการเส้นชัย (Finish Line)', color: '#f59e0b', bg: '#fffbeb' },
  { value: 'ADMIN', label: '🛡️ ผู้ดูแลระบบ / หัวหน้าสนาม (Admin)', color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'VOLUNTEER', label: '🤝 อาสาสมัคร / เจ้าหน้าที่บริการ', color: '#64748b', bg: '#f8fafc' }
];

const LOAD_FAILED_MESSAGE =
  'โหลดรายชื่อเจ้าหน้าที่จากเซิร์ฟเวอร์ไม่สำเร็จ — ข้อมูลด้านล่างเป็นข้อมูลที่เก็บไว้ในเครื่องครั้งล่าสุด';
const LOAD_FAILED_NO_CACHE_MESSAGE =
  'โหลดรายชื่อเจ้าหน้าที่จากเซิร์ฟเวอร์ไม่สำเร็จ และยังไม่มีข้อมูลสำรองในเครื่อง';

/**
 * Reads the last known good staff roster from the browser. Cache only — it is
 * written from confirmed server data, never from made-up rows.
 * @returns {Array<object> | null} null when there is no usable cache
 */
function readCachedStaff() {
  try {
    const saved = localStorage.getItem('trail_staff_list');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch (err) {
    console.error('Cached staff list parse failed:', err);
    return null;
  }
}

/**
 * Shown when the server genuinely returned no staff. Saying so is the point:
 * the alternative was inventing a roster nobody created.
 */
function EmptyStaffState() {
  return (
    <div
      className="card card-pad"
      style={{
        background: '#fff',
        border: '1px dashed var(--line)',
        borderRadius: '12px',
        padding: '36px 24px',
        textAlign: 'center'
      }}
    >
      <Sparkles size={30} style={{ color: 'var(--ink-2)' }} />
      <h4 style={{ margin: '12px 0 6px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
        ยังไม่มีเจ้าหน้าที่ในระบบ
      </h4>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-2)', lineHeight: 1.7 }}>
        เพิ่มเจ้าหน้าที่คนแรกได้จากฟอร์มด้านซ้าย
        <br />
        หากยังเข้าถึงข้อมูลไม่ได้เลย ให้ดูขั้นตอนสร้างผู้ดูแลระบบคนแรกที่ไฟล์{' '}
        <code style={{ background: 'var(--bg-soft)', padding: '1px 6px', borderRadius: '5px', fontSize: '12px' }}>
          supabase/BOOTSTRAP_FIRST_ADMIN.sql
        </code>
      </p>
    </div>
  );
}

export default function StaffSetup({ eventId }) {
  const { addToast, showConfirm, staffList: contextStaffList } = useRace();
  const [staffList, setStaffList] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [stations, setStations] = useState([]);
  // Starts true so the first paint never shows "no staff yet" before the fetch
  // has had a chance to answer.
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [formData, setFormData] = useState({
    id: null,
    name: '',
    role: 'MARSHAL',
    phone: '',
    station_id: '',
    status: 'ACTIVE',
    is_global: false
  });

  useEffect(() => {
    fetchStaff();
    if (eventId) fetchStations();
  }, [eventId]);

  const fetchStations = async () => {
    try {
      const { data } = await supabase
        .from('stations')
        .select('id, name, type')
        .eq('event_id', eventId)
        .order('sequence_order', { ascending: true });
      setStations(data || []);
    } catch (err) {
      console.warn('Error fetching stations for staff:', err);
    }
  };

  // Falls back to the local cache only when the fetch actually failed. An empty
  // result with no error is the legitimate "nobody seeded yet" state right after
  // `db push` — answering it with invented rows made an unseeded event look
  // fully staffed, and those rows blow up on edit because their ids are not uuids.
  const applyCachedStaff = () => {
    const cached = readCachedStaff();
    if (cached) {
      setStaffList(cached);
      setLoadError(LOAD_FAILED_MESSAGE);
      return;
    }
    if (Array.isArray(contextStaffList) && contextStaffList.length > 0) {
      setStaffList(contextStaffList);
      setLoadError(LOAD_FAILED_MESSAGE);
      return;
    }
    setStaffList([]);
    setLoadError(LOAD_FAILED_NO_CACHE_MESSAGE);
  };

  const fetchStaff = async () => {
    setLoading(true);
    try {
      let query = supabase.from('staff').select('*');
      if (eventId) {
        query = query.or(`event_id.eq.${eventId},event_id.is.null`);
      }
      const { data, error } = await query.order('name', { ascending: true });

      if (error) {
        console.error('Fetch staff failed:', error);
        addToast(LOAD_FAILED_MESSAGE, true);
        applyCachedStaff();
        return;
      }

      // No error: the server's answer is the truth, empty list included.
      const rows = data || [];
      setStaffList(rows);
      setLoadError(null);
      if (rows.length > 0) {
        localStorage.setItem('trail_staff_list', JSON.stringify(rows));
      }
    } catch (err) {
      console.error('Fetch staff failed:', err);
      addToast(LOAD_FAILED_MESSAGE, true);
      applyCachedStaff();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleEdit = (staff) => {
    setFormData({
      id: staff.id,
      name: staff.name || '',
      role: staff.role || 'MARSHAL',
      phone: staff.phone || '',
      station_id: staff.station_id || '',
      status: staff.status || 'ACTIVE',
      is_global: !staff.event_id
    });
  };

  const handleClear = () => {
    setFormData({
      id: null,
      name: '',
      role: 'MARSHAL',
      phone: '',
      station_id: '',
      status: 'ACTIVE',
      is_global: false
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast('กรุณาระบุชื่อเจ้าหน้าที่', true);
      return;
    }

    setIsSaving(true);
    const targetEventId = formData.is_global ? null : (eventId || null);

    const payload = {
      name: formData.name.trim(),
      role: formData.role,
      phone: formData.phone.trim() || null,
      station_id: formData.station_id || null,
      status: formData.status,
      event_id: targetEventId
    };

    // No localStorage "success" fallback here any more: writing a rejected record
    // to the browser under a local_ id and showing a green toast made every
    // RLS-blocked save look like it had been stored on the server.
    try {
      if (formData.id && !String(formData.id).startsWith('local_')) {
        // `.select('id')` turns an RLS-filtered UPDATE (204, no error) into a failure.
        assertWriteOk(
          await supabase.from('staff').update(payload).eq('id', formData.id).select('id')
        );
        addToast(`✓ อัปเดตข้อมูลเจ้าหน้าที่ "${formData.name}" สำเร็จ`, false);
      } else {
        assertWriteOk(await supabase.from('staff').insert([payload]).select('id'));
        addToast(`✓ เพิ่มเจ้าหน้าที่ "${formData.name}" สำเร็จ`, false);
      }

      handleClear();
      fetchStaff();
    } catch (err) {
      console.error('Save staff error:', err);
      addToast(`บันทึกข้อมูลเจ้าหน้าที่ไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (staff) => {
    const confirmed = await showConfirm(
      'ยืนยันการลบเจ้าหน้าที่',
      `คุณต้องการลบ "${staff.name}" (${staff.role}) ออกจากระบบใช่หรือไม่?`
    );
    if (!confirmed) return;

    try {
      if (staff.id && !String(staff.id).startsWith('local_')) {
        assertWriteOk(await supabase.from('staff').delete().eq('id', staff.id).select('id'));
      }
      // Local state only mirrors a confirmed server change.
      const updated = staffList.filter(s => s.id !== staff.id);
      setStaffList(updated);
      localStorage.setItem('trail_staff_list', JSON.stringify(updated));
      addToast(`ลบเจ้าหน้าที่ "${staff.name}" สำเร็จ`, false);
      if (formData.id === staff.id) handleClear();
    } catch (err) {
      console.error('Delete staff error:', err);
      addToast(`ลบเจ้าหน้าที่ไม่สำเร็จ: ${err.message}`, true);
    }
  };

  const handleToggleStatus = async (staff) => {
    const nextStatus = staff.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      if (staff.id && !String(staff.id).startsWith('local_')) {
        assertWriteOk(
          await supabase.from('staff').update({ status: nextStatus }).eq('id', staff.id).select('id')
        );
      }
      const updated = staffList.map(s => s.id === staff.id ? { ...s, status: nextStatus } : s);
      setStaffList(updated);
      localStorage.setItem('trail_staff_list', JSON.stringify(updated));
      addToast(`เปลี่ยนสถานะ "${staff.name}" เป็น ${nextStatus === 'ACTIVE' ? 'พร้อมใช้งาน' : 'ระงับชั่วคราว'}`, false);
    } catch (err) {
      console.error('Toggle status error:', err);
      addToast(`เปลี่ยนสถานะไม่สำเร็จ: ${err.message}`, true);
    }
  };

  // Filtered staff list
  const filteredStaff = staffList.filter(s => {
    const matchSearch = !search || (s.name && s.name.toLowerCase().includes(search.toLowerCase())) || (s.phone && s.phone.includes(search));
    const matchRole = !roleFilter || s.role === roleFilter;
    return matchSearch && matchRole;
  });

  // Role pill badge helper
  const getRoleBadge = (role) => {
    const option = ROLE_OPTIONS.find(r => r.value === role) || { label: role, color: '#475569', bg: '#f1f5f9' };
    return (
      <span style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: '4px', 
        fontSize: '12px', 
        fontWeight: 600, 
        padding: '3px 8px', 
        borderRadius: '6px', 
        background: option.bg, 
        color: option.color,
        border: `1px solid ${option.color}25`
      }}>
        {option.label.split(' ')[0]} {role}
      </span>
    );
  };

  const columns = [
    {
      key: 'name',
      label: 'ชื่อเจ้าหน้าที่ / ผู้สแกน',
      render: (val, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            borderRadius: '50%', 
            background: row.status === 'ACTIVE' ? 'var(--start)' : '#e2e8f0', 
            color: row.status === 'ACTIVE' ? '#000' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '13px'
          }}>
            {val ? String(val).charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{val}</div>
            {row.phone && (
              <div style={{ fontSize: '11.5px', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Phone size={10} /> {row.phone}
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'role',
      label: 'บทบาท / หน้าที่',
      render: (val) => getRoleBadge(val)
    },
    {
      key: 'event_id',
      label: 'การใช้งาน',
      render: (val) => (
        <span style={{ fontSize: '12px', color: val ? '#0284c7' : '#059669', fontWeight: 500 }}>
          {val ? '📍 เฉพาะงานนี้' : '🌐 ใช้ได้ทุกงาน'}
        </span>
      )
    },
    {
      key: 'status',
      label: 'สถานะ',
      align: 'center',
      render: (val, row) => (
        <button
          type="button"
          onClick={() => handleToggleStatus(row)}
          title="คลิกเพื่อเปลี่ยนสถานะ"
          style={{ 
            cursor: 'pointer', 
            background: val === 'ACTIVE' ? '#dcfce7' : '#fee2e2', 
            color: val === 'ACTIVE' ? '#15803d' : '#b91c1c', 
            border: 'none', 
            borderRadius: '12px', 
            padding: '2px 8px', 
            fontSize: '11px', 
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {val === 'ACTIVE' ? <><CheckCircle2 size={12} /> พร้อมใช้งาน</> : <><XCircle size={12} /> ปิดชั่วคราว</>}
        </button>
      )
    },
    {
      key: 'actions',
      label: 'จัดการ',
      align: 'center',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <button 
            type="button"
            className="btn btn-sm" 
            onClick={() => handleEdit(row)} 
            title="แก้ไขข้อมูลเจ้าหน้าที่"
            style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--bg-soft)', border: '1px solid var(--line)' }}
          >
            <Edit3 size={13} />
          </button>
          <button 
            type="button"
            className="btn btn-sm" 
            onClick={() => handleDelete(row)} 
            title="ลบเจ้าหน้าที่"
            style={{ padding: '4px 8px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div>
      {/* ── Summary Statistics Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div className="card card-pad" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-2)', fontWeight: 600 }}>เจ้าหน้าที่ทั้งหมด</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)' }}>{staffList.length} <span style={{ fontSize: '13px', fontWeight: 400 }}>คน</span></div>
          </div>
        </div>

        <div className="card card-pad" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flag size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-2)', fontWeight: 600 }}>Marshal & Check Point</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#059669' }}>
              {staffList.filter(s => s.role === 'MARSHAL').length} <span style={{ fontSize: '13px', fontWeight: 400 }}>คน</span>
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-2)', fontWeight: 600 }}>Start & Finish Crew</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#b45309' }}>
              {staffList.filter(s => s.role === 'CHECKIN_CREW' || s.role === 'FINISH_JUDGE').length} <span style={{ fontSize: '13px', fontWeight: 400 }}>คน</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Setup Grid ── */}
      <div className="event-setup-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.6fr)', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Form: Add / Edit Staff */}
        <div className="card card-pad event-setup-card" style={{ background: '#fff', borderRadius: '12px', border: formData.id ? '2px solid var(--ink)' : '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {formData.id ? <><Edit3 size={18} /> แก้ไขข้อมูลเจ้าหน้าที่</> : <><UserPlus size={18} /> เพิ่มคนสแกน / เจ้าหน้าที่ใหม่</>}
            </h3>
            {formData.id && (
              <span style={{ fontSize: '11px', background: 'var(--bg-soft)', padding: '2px 8px', borderRadius: '6px', color: 'var(--ink-2)' }}>
                กำลังแก้ไข
              </span>
            )}
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
                ชื่อ-นามสกุล / ชื่อเรียก <span style={{ color: 'var(--warn)' }}>*</span>
              </label>
              <input
                type="text"
                name="name"
                className="search"
                value={formData.name}
                onChange={handleChange}
                placeholder="เช่น สมชาย (Marshal 1) หรือ แอดมินเอก"
                required
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
                บทบาท / หน้าที่ (Role) <span style={{ color: 'var(--warn)' }}>*</span>
              </label>
              <select
                name="role"
                className="search"
                value={formData.role}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-row-2">
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
                  เบอร์โทรศัพท์ติดต่อ
                </label>
                <input
                  type="tel"
                  name="phone"
                  className="search"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="081-xxx-xxxx"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
                  สถานะการทำงาน
                </label>
                <select
                  name="status"
                  className="search"
                  value={formData.status}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}
                >
                  <option value="ACTIVE">🟢 พร้อมปฏิบัติงาน (ACTIVE)</option>
                  <option value="INACTIVE">🔴 ปิดใช้งานชั่วคราว (INACTIVE)</option>
                </select>
              </div>
            </div>

            {stations.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
                  จุดตรวจประจำการหลัก (Optional)
                </label>
                <select
                  name="station_id"
                  className="search"
                  value={formData.station_id}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}
                >
                  <option value="">-- ไม่ระบุจุดประจำการ --</option>
                  {stations.map(st => (
                    <option key={st.id} value={st.id}>{st.name} ({st.type})</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <input 
                type="checkbox" 
                id="is_global_staff" 
                name="is_global"
                checked={formData.is_global}
                onChange={handleChange}
                style={{ width: '16px', height: '16px', accentColor: 'var(--ink)', cursor: 'pointer' }}
              />
              <label htmlFor="is_global_staff" style={{ fontSize: '12.5px', color: 'var(--ink)', cursor: 'pointer', userSelect: 'none' }}>
                <b>ใช้ได้กับทุกงานวิ่ง (Global Staff)</b> — สามารถเลือกชื่อนี้ในทุกงานวิ่งได้ทันที
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                type="submit"
                className="btn"
                disabled={isSaving}
                style={{ flex: 1, background: formData.id ? '#2563eb' : '#16a34a', color: '#fff', padding: '10px', fontSize: '0.95rem', fontWeight: 600, border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer' }}
              >
                {isSaving ? 'กำลังบันทึก...' : (formData.id ? '💾 บันทึกการแก้ไข' : '➕ เพิ่มเจ้าหน้าที่')}
              </button>
              {formData.id && (
                <button
                  type="button"
                  className="btn"
                  onClick={handleClear}
                  style={{ padding: '10px 16px', background: 'var(--bg-soft)', border: '1px solid var(--line)' }}
                >
                  ยกเลิก
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Table: Staff Directory */}
        <div className="event-setup-table-wrap" style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
          
          {/* Table Header Filter Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-2)' }} />
                <input 
                  type="text" 
                  className="search" 
                  placeholder="ค้นหาชื่อ หรือ เบอร์โทร..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px 6px 32px', fontSize: '13px' }}
                />
              </div>
              <select
                className="search"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{ width: '150px', padding: '6px 10px', fontSize: '12.5px' }}
              >
                <option value="">ทุกบทบาทหน้าที่</option>
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label.split(' ')[0]} {opt.value}</option>
                ))}
              </select>
            </div>
            
            <div style={{ fontSize: '12.5px', color: 'var(--ink-2)', fontWeight: 600 }}>
              พบ {filteredStaff.length} คน
            </div>
          </div>

          {loadError && (
            <div
              role="alert"
              style={{
                marginBottom: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: '12.5px',
                fontWeight: 600
              }}
            >
              ⚠️ {loadError}
            </div>
          )}

          {/* Only claim the roster is empty when the server actually said so —
              a failed load is reported by the banner above instead. */}
          {!loading && !loadError && staffList.length === 0 ? (
            <EmptyStaffState />
          ) : (
            <AdvancedTable
              columns={columns}
              data={filteredStaff}
              loading={loading}
              emptyMessage="ยังไม่มีรายชื่อเจ้าหน้าที่ กรุณาเพิ่มที่ฟอร์มด้านซ้าย"
              pageSize={10}
            />
          )}
        </div>

      </div>
    </div>
  );
}
