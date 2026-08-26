import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRace } from '../../context/RaceContext';
import AdvancedTable from '../AdvancedTable';

export default function StationsSetup({ eventId }) {
  const { addToast, showConfirm } = useRace();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    name: '',
    type: 'CP',
    sequence_order: 1
  });

  useEffect(() => {
    if (eventId) fetchStations();
  }, [eventId]);

  const fetchStations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stations')
        .select('*')
        .eq('event_id', eventId)
        .order('sequence_order', { ascending: true });
      if (error) throw error;
      setStations(data || []);
    } catch (err) {
      console.error(err);
      addToast('ดึงข้อมูลจุดเช็คพอยต์ไม่สำเร็จ', true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEdit = (st) => {
    setFormData({
      id: st.id,
      name: st.name,
      type: st.type,
      sequence_order: st.sequence_order
    });
  };

  const handleClear = (nextSeq = null) => {
    setFormData({ id: null, name: '', type: 'CP', sequence_order: nextSeq !== null ? nextSeq : (stations.length > 0 ? stations[stations.length - 1].sequence_order + 1 : 1) });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.type) {
      addToast('กรุณากรอกข้อมูลให้ครบถ้วน', true);
      return;
    }

    setIsSaving(true);
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('stations')
          .update({
            name: formData.name,
            type: formData.type,
            sequence_order: parseInt(formData.sequence_order)
          })
          .eq('id', formData.id);
        if (error) throw error;
        addToast('อัปเดตจุดตรวจสำเร็จ', false);
      } else {
        const { error } = await supabase
          .from('stations')
          .insert([{
            event_id: eventId,
            name: formData.name,
            type: formData.type,
            sequence_order: parseInt(formData.sequence_order)
          }]);
        if (error) throw error;
        addToast('เพิ่มจุดตรวจสำเร็จ', false);
      }

      let nextSeq = null;
      if (!formData.id) {
        nextSeq = parseInt(formData.sequence_order) + 1;
      }
      handleClear(nextSeq);
      fetchStations();
    } catch (err) {
      console.error(err);
      addToast(`บันทึกไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm('ยืนยันการลบ', 'คุณต้องการลบจุดตรวจนี้ใช่หรือไม่?');
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('stations').delete().eq('id', id);
      if (error) throw error;
      addToast('ลบจุดตรวจสำเร็จ', false);
      fetchStations();
      if (formData.id === id) handleClear();
    } catch (err) {
      console.error(err);
      addToast(`ลบไม่สำเร็จ: ${err.message}`, true);
    }
  };

  const columns = [
    { key: 'sequence_order', label: 'ลำดับ', defaultWidth: 80, align: 'center' },
    { key: 'name', label: 'ชื่อจุด (Name)' },
    { key: 'type', label: 'ประเภท (Type)' },
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
          {formData.id ? '✏️ แก้ไขจุดตรวจ' : '✨ เพิ่มจุดตรวจใหม่'}
        </h3>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ชื่อจุด (เช่น CP1, WS1)</label>
            <input className="search" type="text" name="name" value={formData.name} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
          </div>
          <div className="form-row-2">
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ประเภท</label>
              <select className="search" name="type" value={formData.type} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
                <option value="START">START</option>
                <option value="CP">CP (จุดเช็คพอยต์)</option>
                <option value="FINISH">FINISH</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ลำดับ (Sequence)</label>
              <input className="search" type="number" name="sequence_order" value={formData.sequence_order} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
            </div>
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
          <AdvancedTable columns={columns} data={stations} pageSize={10} maxHeight="400px" />
        )}
      </div>
    </div>
  );
}
