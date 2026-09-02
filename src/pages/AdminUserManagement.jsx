import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useRace } from '../context/RaceContext';
import AdvancedTable from '../components/AdvancedTable';
import { 
  UserCheck, 
  UserPlus, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  Key,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'MARSHAL', label: '🚩 Marshal ประจำจุดตรวจ (Check Point)', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'CHECKIN_CREW', label: '🟢 เจ้าหน้าที่จุดสตาร์ท / Check-in', color: '#10b981', bg: '#ecfdf5' },
  { value: 'FINISH_JUDGE', label: '🏁 กรรมการเส้นชัย (Finish Line)', color: '#f59e0b', bg: '#fffbeb' },
  { value: 'ADMIN', label: '🛡️ ผู้ดูแลระบบ / หัวหน้าสนาม (Admin)', color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'VOLUNTEER', label: '🤝 อาสาสมัคร / เจ้าหน้าที่บริการ', color: '#64748b', bg: '#f8fafc' }
];

export default function AdminUserManagement() {
  const { role } = useAuth();
  const { eventId, addToast, showConfirm } = useRace();
  
  const [users, setUsers] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [formData, setFormData] = useState({
    id: null,
    user_id: null,
    name: '',
    role: 'MARSHAL',
    phone: '',
    station_id: '',
    status: 'ACTIVE',
    is_global: false,
    pin: ''
  });

  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (role === 'ADMIN') {
      fetchUsers();
      if (eventId) fetchStations();
    }
  }, [eventId, role]);

  if (role !== 'ADMIN') {
    return <div className="card card-pad" style={{ marginTop: '20px', textAlign: 'center', color: 'var(--warn)' }}>Access Denied: Admins Only</div>;
  }

  const fetchStations = async () => {
    try {
      const { data } = await supabase
        .from('stations')
        .select('id, name, type')
        .eq('event_id', eventId)
        .order('sequence_order', { ascending: true });
      setStations(data || []);
    } catch (err) {
      console.warn('Error fetching stations:', err);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-mgmt', {
        method: 'GET',
        query: eventId ? { event_id: eventId } : undefined
      });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Fetch users error:', err);
      addToast('โหลดรายชื่อผู้ใช้ไม่สำเร็จ: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const generatePin = () => {
    // Generate 6 digit pin
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    setFormData(prev => ({ ...prev, pin: newPin }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleEdit = (user) => {
    setFormData({
      id: user.id,
      user_id: user.user_id,
      name: user.name || '',
      role: user.role || 'MARSHAL',
      phone: user.phone || '',
      station_id: user.station_id || '',
      status: user.status || 'ACTIVE',
      is_global: !user.event_id,
      pin: '' // Require new pin if they want to change it
    });
    setShowPin(false);
  };

  const handleClear = () => {
    setFormData({
      id: null,
      user_id: null,
      name: '',
      role: 'MARSHAL',
      phone: '',
      station_id: '',
      status: 'ACTIVE',
      is_global: false,
      pin: ''
    });
    setShowPin(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast('กรุณาระบุชื่อเจ้าหน้าที่', true);
      return;
    }

    if (!formData.id && !formData.pin) {
      addToast('กรุณาระบุหรือสุ่มรหัส PIN สำหรับผู้ใช้งานใหม่', true);
      return;
    }

    if (formData.pin && (formData.pin.length < 4 || formData.pin.length > 12)) {
      addToast('รหัส PIN ต้องมีความยาวระหว่าง 4-12 หลัก', true);
      return;
    }

    setIsSaving(true);
    
    try {
      const payload = { ...formData, event_id: eventId };

      if (formData.id) {
        // Update existing
        const { error } = await supabase.functions.invoke('admin-user-mgmt', {
          method: 'PUT',
          body: payload
        });
        if (error) throw error;
        addToast(`✓ อัปเดตข้อมูล "${formData.name}" สำเร็จ`, false);
      } else {
        // Create new
        const { error } = await supabase.functions.invoke('admin-user-mgmt', {
          method: 'POST',
          body: payload
        });
        if (error) throw error;
        addToast(`✓ เพิ่มผู้ใช้งาน "${formData.name}" สำเร็จ`, false);
      }

      handleClear();
      fetchUsers();
    } catch (err) {
      console.error('Save user error:', err);
      addToast(`บันทึกข้อมูลไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (user) => {
    const confirmed = await showConfirm(
      'ยืนยันการลบผู้ใช้งาน',
      `คุณต้องการลบ "${user.name}" ออกจากระบบถาวรใช่หรือไม่? ข้อมูลการเข้าสู่ระบบจะถูกลบทั้งหมด`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.functions.invoke('admin-user-mgmt', {
        method: 'DELETE',
        query: { user_id: user.user_id }
      });
      if (error) throw error;
      
      addToast(`ลบผู้ใช้งาน "${user.name}" สำเร็จ`, false);
      if (formData.id === user.id) handleClear();
      fetchUsers();
    } catch (err) {
      console.error('Delete user error:', err);
      addToast(`ลบผู้ใช้งานไม่สำเร็จ: ${err.message}`, true);
    }
  };

  const getRoleBadge = (roleStr) => {
    const option = ROLE_OPTIONS.find(r => r.value === roleStr) || { label: roleStr, color: '#475569', bg: '#f1f5f9' };
    return (
      <span style={{ 
        display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', 
        fontWeight: 600, padding: '3px 8px', borderRadius: '6px', 
        background: option.bg, color: option.color, border: `1px solid ${option.color}25`
      }}>
        {option.label.split(' ')[0]} {roleStr}
      </span>
    );
  };

  const filteredUsers = users.filter(s => {
    const matchSearch = !search || (s.name && s.name.toLowerCase().includes(search.toLowerCase())) || (s.phone && s.phone.includes(search));
    const matchRole = !roleFilter || s.role === roleFilter;
    return matchSearch && matchRole;
  });

  const columns = [
    {
      key: 'name',
      label: 'ชื่อผู้ใช้งาน (Staff)',
      render: (val, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ 
            width: '32px', height: '32px', borderRadius: '50%', 
            background: row.status === 'ACTIVE' ? 'var(--start)' : '#e2e8f0', 
            color: row.status === 'ACTIVE' ? '#000' : '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px'
          }}>
            {val ? String(val).charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{val}</div>
            <div style={{ fontSize: '11px', color: 'var(--ink-2)' }}>ID: {row.user_id ? row.user_id.split('-')[0] + '...' : 'ไม่มีบัญชี'}</div>
          </div>
        </div>
      )
    },
    { key: 'role', label: 'บทบาท', render: (val) => getRoleBadge(val) },
    {
      key: 'pin_status',
      label: 'รหัส PIN',
      render: (_, row) => {
        const hasPin = row.event_pins && row.event_pins.length > 0;
        return (
          <span style={{ fontSize: '12px', color: hasPin ? '#059669' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
            {hasPin ? <><Key size={13}/> มีรหัสแล้ว</> : <><XCircle size={13}/> ยังไม่มีรหัส</>}
          </span>
        );
      }
    },
    {
      key: 'actions',
      label: 'จัดการ',
      align: 'center',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <button 
            type="button" className="btn btn-sm" onClick={() => handleEdit(row)} 
            title="แก้ไขข้อมูลและ PIN"
            style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--bg-soft)', border: '1px solid var(--line)' }}
          >
            <Edit3 size={13} />
          </button>
          <button 
            type="button" className="btn btn-sm" onClick={() => handleDelete(row)} 
            title="ลบผู้ใช้งาน"
            style={{ padding: '4px 8px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="page active">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>จัดการ User (Admin)</h1>
          <p>เพิ่ม ลบ แก้ไข ผู้ใช้งานระบบและจัดการรหัส PIN</p>
        </div>
        <div className="badge b-fin"><span className="dot"></span> ระบบผู้ดูแล (Admin)</div>
      </div>

      <div className="event-setup-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.6fr)', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Form */}
        <div className="card card-pad event-setup-card" style={{ background: '#fff', borderRadius: '12px', border: formData.id ? '2px solid var(--ink)' : '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {formData.id ? <><Edit3 size={18} /> แก้ไขข้อมูลผู้ใช้งาน</> : <><UserPlus size={18} /> เพิ่มผู้ใช้งานใหม่</>}
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
                type="text" name="name" className="search"
                value={formData.name} onChange={handleChange}
                placeholder="เช่น สมชาย หรือ แอดมินเอก" required
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
                บทบาท / หน้าที่ (Role) <span style={{ color: 'var(--warn)' }}>*</span>
              </label>
              <select
                name="role" className="search" value={formData.role} onChange={handleChange} required
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}
              >
                {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>

            <div className="form-row-2" style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>เบอร์โทรศัพท์</label>
                <input type="tel" name="phone" className="search" value={formData.phone} onChange={handleChange} placeholder="081-xxx-xxxx" style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>สถานะ</label>
                <select name="status" className="search" value={formData.status} onChange={handleChange} style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}>
                  <option value="ACTIVE">🟢 เปิดใช้งาน</option>
                  <option value="INACTIVE">🔴 ปิดชั่วคราว</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
                ตั้งค่ารหัสผ่าน (PIN) {formData.id && <span style={{ color: 'var(--ink-2)', fontWeight: 400 }}>(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</span>}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showPin ? "text" : "password"} name="pin" className="search"
                    value={formData.pin} onChange={handleChange}
                    placeholder={formData.id ? "ปล่อยว่างเพื่อใช้รหัสเดิม" : "ตั้งรหัส 6 หลัก"}
                    style={{ width: '100%', padding: '9px 36px 9px 12px', fontSize: '1rem', letterSpacing: '0.1em', fontFamily: 'var(--mono)' }}
                  />
                  <button type="button" onClick={() => setShowPin(!showPin)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink-2)' }}>
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button type="button" onClick={generatePin} className="btn" style={{ background: 'var(--bg-soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                  <RefreshCw size={16} /> สุ่มรหัส
                </button>
              </div>
            </div>

            {stations.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>จุดตรวจประจำการ</label>
                <select name="station_id" className="search" value={formData.station_id} onChange={handleChange} style={{ width: '100%', padding: '9px 12px', fontSize: '0.9rem' }}>
                  <option value="">-- ไม่ระบุ --</option>
                  {stations.map(st => <option key={st.id} value={st.id}>{st.name} ({st.type})</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <input type="checkbox" id="is_global_staff" name="is_global" checked={formData.is_global} onChange={handleChange} style={{ width: '16px', height: '16px', accentColor: 'var(--ink)' }} />
              <label htmlFor="is_global_staff" style={{ fontSize: '12.5px', color: 'var(--ink)' }}><b>ใช้ได้กับทุกงานวิ่ง (Global Staff)</b></label>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button type="submit" className="btn" disabled={isSaving} style={{ flex: 1, background: formData.id ? '#2563eb' : '#16a34a', border: 'none', padding: '10px', fontSize: '0.95rem' }}>
                {isSaving ? 'กำลังบันทึก...' : (formData.id ? '💾 บันทึกการแก้ไข' : '➕ สร้างผู้ใช้และ PIN')}
              </button>
              {formData.id && (
                <button type="button" className="btn" onClick={handleClear} style={{ background: 'var(--bg-soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>ยกเลิก</button>
              )}
            </div>
          </form>
        </div>

        {/* Right Table */}
        <div className="event-setup-table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-2)' }} />
              <input type="text" className="search" placeholder="ค้นหาชื่อ..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '6px 10px 6px 32px', fontSize: '13px' }} />
            </div>
            <button onClick={fetchUsers} className="btn btn-sm" style={{ background: 'var(--bg-soft)', color: 'var(--ink)', border: '1px solid var(--line)', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <RefreshCw size={13} /> รีเฟรช
            </button>
          </div>
          
          <AdvancedTable columns={columns} data={filteredUsers} loading={loading} emptyMessage="ไม่พบผู้ใช้งาน" pageSize={10} />
        </div>
      </div>
    </div>
  );
}
