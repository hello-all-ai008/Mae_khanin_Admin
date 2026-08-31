import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { assertWriteOk } from '../../lib/supabaseResult';
import { useRace } from '../../context/RaceContext';
import AdvancedTable from '../AdvancedTable';

export default function LocationsSetup({ eventId }) {
  const { addToast, showConfirm } = useRace();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    name: '',
    latitude: '',
    longitude: '',
    url: ''
  });

  useEffect(() => {
    if (eventId) fetchLocations();
  }, [eventId]);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('event_id', eventId)
        .order('name', { ascending: true });
      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      console.error(err);
      addToast('ดึงข้อมูลสถานที่ไมสำเร็จ', true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEdit = (loc) => {
    setFormData({
      id: loc.id,
      name: loc.name,
      latitude: loc.latitude || '',
      longitude: loc.longitude || '',
      url: loc.url || ''
    });
  };

  const handleClear = () => {
    setFormData({ id: null, name: '', latitude: '', longitude: '', url: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      addToast('กรุณากรอกชื่อสถานที่', true);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        url: formData.url || null
      };

      if (formData.id) {
        // `.select('id')` so an RLS-filtered UPDATE (204, no error) is not reported as success.
        assertWriteOk(await supabase.from('locations').update(payload).eq('id', formData.id).select('id'));
        addToast('อัปเดตสถานที่สำเร็จ', false);
      } else {
        assertWriteOk(await supabase.from('locations').insert([{ ...payload, event_id: eventId }]).select('id'));
        addToast('เพิ่มสถานที่สำเร็จ', false);
      }
      handleClear();
      fetchLocations();
    } catch (err) {
      console.error(err);
      addToast(`บันทึกไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm('ยืนยันการลบ', 'คุณต้องการลบสถานที่นี้ใช่หรือไม่?');
    if (!confirmed) return;
    try {
      assertWriteOk(await supabase.from('locations').delete().eq('id', id).select('id'));
      addToast('ลบสถานที่สำเร็จ', false);
      fetchLocations();
      if (formData.id === id) handleClear();
    } catch (err) {
      console.error(err);
      addToast(`ลบไม่สำเร็จ: ${err.message}`, true);
    }
  };

  const columns = [
    { key: 'name', label: 'ชื่อสถานที่' },
    { key: 'latitude', label: 'Lat', defaultWidth: 100 },
    { key: 'longitude', label: 'Lng', defaultWidth: 100 },
    {
      key: 'url',
      label: 'Google Maps',
      render: (val) => val ? <a href={val} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-dark)' }}>Link</a> : '-'
    },
    {
      key: 'actions',
      label: 'จัดการ',
      align: 'center',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button className="btn btn-sm" onClick={() => handleEdit(r)} style={{ padding: '2px 8px', fontSize: '12px' }}>✏️ แก้ไข</button>
          <button className="btn btn-sm" onClick={() => handleDelete(r.id)} style={{ padding: '2px 8px', fontSize: '12px', background: '#fee2e2', color: '#b91c1c' }}>🗑️ ลบ</button>
        </div>
      )
    }
  ];

  return (
    <div className="event-setup-grid">
      <div className="card card-pad event-setup-card" style={{ background: formData.id ? '#fffbeb' : 'var(--bg-soft)', border: formData.id ? '2px solid #f59e0b' : '1px solid var(--line)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: formData.id ? '#b45309' : 'inherit' }}>
          {formData.id ? '✏️ แก้ไขสถานที่' : '✨ เพิ่มสถานที่ใหม่'}
        </h3>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ชื่อสถานที่</label>
            <input className="search" type="text" name="name" value={formData.name} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
          </div>
          <div className="form-row-2">
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ละติจูด (Lat)</label>
              <input className="search" type="number" step="any" name="latitude" value={formData.latitude} onChange={handleChange} style={{ width: '100%', padding: '8px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ลองจิจูด (Lng)</label>
              <input className="search" type="number" step="any" name="longitude" value={formData.longitude} onChange={handleChange} style={{ width: '100%', padding: '8px' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>Google Maps URL</label>
            <input className="search" type="url" name="url" value={formData.url} onChange={handleChange} placeholder="https://maps.app.goo.gl/..." style={{ width: '100%', padding: '8px' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button type="submit" className="btn" disabled={isSaving} style={{ flex: 1, background: formData.id ? '#2563eb' : '#16a34a', color: '#fff', border: 'none', fontWeight: 600, padding: '10px' }}>
              {isSaving ? 'กำลังบันทึก...' : (formData.id ? '💾 บันทึกการแก้ไข' : 'บันทึก')}
            </button>
            {formData.id && (
              <button type="button" className="btn" onClick={handleClear} style={{ border: '1px solid var(--line)', background: '#fff', padding: '10px' }}>ยกเลิก</button>
            )}
          </div>
        </form>
      </div>

      <div className="event-setup-table-wrap">
        {loading ? (
          <div className="card card-pad empty">กำลังโหลด...</div>
        ) : (
          <AdvancedTable columns={columns} data={locations} pageSize={10} maxHeight="400px" />
        )}
      </div>
    </div>
  );
}
