import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRace } from '../../context/RaceContext';
import AdvancedTable from '../AdvancedTable';

export default function CategoriesSetup({ eventId }) {
  const { addToast, showConfirm } = useRace();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    name: '',
    distance_km: '',
    unit: 'km'
  });

  useEffect(() => {
    if (eventId) fetchCategories();
  }, [eventId]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('event_id', eventId)
        .order('distance_km', { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error(err);
      addToast('ดึงข้อมูล Categories ไม่สำเร็จ', true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEdit = (cat) => {
    setFormData({
      id: cat.id,
      name: cat.name,
      distance_km: cat.distance_km,
      unit: cat.unit || 'km'
    });
    addToast(`กำลังแก้ไข: ${cat.name}`, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClear = () => {
    setFormData({ id: null, name: '', distance_km: '', unit: 'km' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.distance_km) {
      addToast('กรุณากรอกข้อมูลให้ครบถ้วน', true);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        distance_km: parseFloat(formData.distance_km),
        unit: formData.unit || 'km'
      };

      if (formData.id) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', formData.id);

        if (error) throw error;
        addToast(`✓ อัปเดตระยะทาง "${formData.name}" สำเร็จ`, false);
      } else {
        const { error } = await supabase
          .from('categories')
          .insert([{
            event_id: eventId,
            ...payload
          }]);

        if (error) throw error;
        addToast(`✓ เพิ่มระยะทาง "${formData.name}" สำเร็จ`, false);
      }
      handleClear();
      fetchCategories();
    } catch (err) {
      console.error(err);
      addToast(`บันทึกไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    const confirmed = await showConfirm('ยืนยันการลบ', `คุณต้องการลบระยะทาง "${name || ''}" ใช่หรือไม่? ข้อมูลที่เกี่ยวข้องอาจได้รับผลกระทบ`);
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      addToast('ลบระยะทางสำเร็จ', false);
      fetchCategories();
      if (formData.id === id) handleClear();
    } catch (err) {
      console.error(err);
      addToast(`ลบไม่สำเร็จ: ${err.message}`, true);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'ชื่อระยะ (Name)',
      defaultWidth: 160,
      render: (val, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600 }}>{val}</span>
          {formData.id === r.id && (
            <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
              กำลังแก้ไข
            </span>
          )}
        </div>
      )
    },
    { key: 'distance_km', label: 'ระยะทาง', defaultWidth: 120 },
    { key: 'unit', label: 'หน่วย', defaultWidth: 100 },
    {
      key: 'actions',
      label: 'จัดการ',
      defaultWidth: 170,
      align: 'center',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => { e.stopPropagation(); handleEdit(r); }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              background: formData.id === r.id ? '#f59e0b' : 'var(--ink)',
              color: formData.id === r.id ? '#000' : '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '6px'
            }}
          >
            ✏️ แก้ไข
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => { e.stopPropagation(); handleDelete(r.id, r.name); }}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              background: '#fee2e2',
              color: '#b91c1c',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '6px'
            }}
          >
            🗑️ ลบ
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="event-setup-grid">
      <div className="card card-pad event-setup-card" style={{ background: formData.id ? '#fffbeb' : 'var(--bg-soft)', border: formData.id ? '2px solid #f59e0b' : '1px solid var(--line)', transition: 'all 0.2s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: formData.id ? '#b45309' : 'inherit' }}>
            {formData.id ? `✏️ กำลังแก้ไขระยะ: ${formData.name}` : '✨ เพิ่มระยะทางใหม่'}
          </h3>
          {formData.id && (
            <span style={{ fontSize: '12px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              Edit Mode
            </span>
          )}
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Quick Edit Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
              เลือกเพื่อแก้ไขระยะทางเดิม:
            </label>
            <select
              className="search"
              value={formData.id || ''}
              onChange={(e) => {
                const selectedId = e.target.value;
                if (!selectedId) {
                  handleClear();
                } else {
                  const found = categories.find(c => c.id === selectedId);
                  if (found) handleEdit(found);
                }
              }}
              style={{ width: '100%', padding: '8px 10px', background: formData.id ? '#fff' : 'var(--bg)', borderColor: formData.id ? '#f59e0b' : 'var(--line)', fontWeight: formData.id ? 600 : 'normal' }}
            >
              <option value="">➕ [ สร้างระยะทางใหม่ / New Distance ]</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  ✏️ {cat.name} ({cat.distance_km} {cat.unit || 'km'})
                </option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: '1px dashed var(--line)', paddingTop: '10px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ชื่อระยะ (เช่น MKT10, 50K) <span style={{ color: 'var(--warn)' }}>*</span></label>
            <input className="search" type="text" name="name" value={formData.name} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
          </div>
          <div className="form-row-2">
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ระยะทาง (ตัวเลข) <span style={{ color: 'var(--warn)' }}>*</span></label>
              <input className="search" type="number" step="0.1" name="distance_km" value={formData.distance_km} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>หน่วย</label>
              <select className="search" name="unit" value={formData.unit} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
                <option value="km">km</option>
                <option value="miles">miles</option>
                <option value="m">m</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="submit"
              className="btn"
              disabled={isSaving}
              style={{
                flex: 1,
                background: formData.id ? '#2563eb' : '#16a34a',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                padding: '10px',
                cursor: 'pointer'
              }}
            >
              {isSaving ? 'กำลังบันทึก...' : (formData.id ? '💾 บันทึกการแก้ไข' : '➕ เพิ่มระยะทาง')}
            </button>
            {formData.id && (
              <button
                type="button"
                className="btn"
                onClick={handleClear}
                style={{ border: '1px solid var(--line)', background: '#fff', padding: '10px', cursor: 'pointer' }}
              >
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="event-setup-table-wrap">
        {loading ? (
          <div className="card card-pad empty">กำลังโหลด...</div>
        ) : (
          <AdvancedTable columns={columns} data={categories} pageSize={10} maxHeight="400px" />
        )}
      </div>
    </div>
  );
}
