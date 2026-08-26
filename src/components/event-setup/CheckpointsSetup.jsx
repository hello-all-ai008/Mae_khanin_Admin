import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRace } from '../../context/RaceContext';
import AdvancedTable from '../AdvancedTable';

export default function CheckpointsSetup({ eventId }) {
  const { addToast, showConfirm } = useRace();

  const [categories, setCategories] = useState([]);
  const [stations, setStations] = useState([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    station_id: '',
    sequence_order: 1,
    start_time: '',
    cutoff_time: ''
  });

  useEffect(() => {
    if (eventId) {
      fetchDropdownData();
    }
  }, [eventId]);

  useEffect(() => {
    if (selectedCategoryId) {
      fetchCheckpoints();
      handleClear();
    } else {
      setCheckpoints([]);
    }
  }, [selectedCategoryId]);

  const fetchDropdownData = async () => {
    try {
      const { data: cats } = await supabase.from('categories').select('*').eq('event_id', eventId).order('distance_km', { ascending: true });
      const { data: stas } = await supabase.from('stations').select('*').eq('event_id', eventId).order('sequence_order', { ascending: true });

      setCategories(cats || []);
      setStations(stas || []);

      if (cats && cats.length > 0) {
        setSelectedCategoryId(cats[0].id);
      }
    } catch (err) {
      console.error(err);
      addToast('ดึงข้อมูลเริ่มต้นไม่สำเร็จ', true);
    }
  };

  const fetchCheckpoints = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('checkpoint')
        .select(`
          id, category_id, station_id, sequence_order, cutoff_time,
          stations ( name, type )
        `)
        .eq('category_id', selectedCategoryId)
        .order('sequence_order', { ascending: true });

      if (error) throw error;

      const formattedData = (data || []).map(cp => ({
        ...cp,
        station_name: cp.stations?.name,
        station_type: cp.stations?.type
      }));

      setCheckpoints(formattedData);
    } catch (err) {
      console.error(err);
      addToast('ดึงข้อมูล Checkpoint ไม่สำเร็จ', true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const formatIsoForInput = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      const offset = d.getTimezoneOffset() * 60000;
      return (new Date(d.getTime() - offset)).toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  const handleEdit = (cp) => {
    setFormData({
      id: cp.id,
      station_id: cp.station_id || '',
      sequence_order: cp.sequence_order || 1,
      start_time: formatIsoForInput(cp.cutoff_time && cp.station_type === 'START' ? cp.cutoff_time : ''),
      cutoff_time: formatIsoForInput(cp.cutoff_time)
    });
    addToast(`กำลังแก้ไข: ${cp.station_name || 'Checkpoint'}`, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClear = (nextSeq = null) => {
    setFormData({
      id: null,
      station_id: stations.length > 0 ? stations[0].id : '',
      sequence_order: nextSeq !== null ? nextSeq : (checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].sequence_order + 1 : 1),
      start_time: '',
      cutoff_time: ''
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedCategoryId || !formData.station_id || !formData.sequence_order) {
      addToast('กรุณากรอกข้อมูลให้ครบถ้วน', true);
      return;
    }

    // Choose cutoff_time or start_time based on station type or input
    const selectedStation = stations.find(s => s.id === formData.station_id);
    const isStartStation = selectedStation?.type === 'START';

    let parsedTimestamp = null;
    const timeValueToUse = isStartStation ? (formData.start_time || formData.cutoff_time) : formData.cutoff_time;
    if (timeValueToUse) {
      parsedTimestamp = new Date(timeValueToUse).toISOString();
    }

    setIsSaving(true);
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('checkpoint')
          .update({
            station_id: formData.station_id,
            sequence_order: parseInt(formData.sequence_order),
            cutoff_time: parsedTimestamp
          })
          .eq('id', formData.id);
        if (error) throw error;
        addToast('✓ อัปเดต Checkpoint สำเร็จ', false);
      } else {
        const { error } = await supabase
          .from('checkpoint')
          .insert([{
            category_id: selectedCategoryId,
            station_id: formData.station_id,
            sequence_order: parseInt(formData.sequence_order),
            cutoff_time: parsedTimestamp
          }]);
        if (error) throw error;
        addToast('✓ เพิ่ม Checkpoint สำเร็จ', false);
      }

      let nextSeq = null;
      if (!formData.id) {
        nextSeq = parseInt(formData.sequence_order) + 1;
      }
      handleClear(nextSeq);
      fetchCheckpoints();
    } catch (err) {
      console.error(err);
      addToast(`บันทึกไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    const confirmed = await showConfirm('ยืนยันการลบ', `คุณต้องการลบ Checkpoint "${name || ''}" ออกจากระยะทางนี้ใช่หรือไม่?`);
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('checkpoint').delete().eq('id', id);
      if (error) throw error;
      addToast('ลบ Checkpoint สำเร็จ', false);
      fetchCheckpoints();
      if (formData.id === id) handleClear();
    } catch (err) {
      console.error(err);
      addToast(`ลบไม่สำเร็จ: ${err.message}`, true);
    }
  };

  const selectedCategoryObj = categories.find(c => c.id === selectedCategoryId);
  const currentStationObj = stations.find(s => s.id === formData.station_id);

  const columns = [
    { key: 'sequence_order', label: 'ลำดับ (Seq)', defaultWidth: 90, align: 'center' },
    {
      key: 'station_name',
      label: 'ชื่อจุดตรวจ (Station)',
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
    {
      key: 'station_type',
      label: 'ประเภท',
      defaultWidth: 100,
      render: (val) => (
        <span className={`badge ${val === 'START' ? 'b-start' : val === 'FINISH' ? 'b-fin' : 'b-cp'}`}>
          {val}
        </span>
      )
    },
    {
      key: 'cutoff_time',
      label: 'เวลา Start / Cut-off',
      defaultWidth: 170,
      render: (val, r) => {
        if (!val) return <span style={{ color: 'var(--ink-2)' }}>—</span>;
        const d = new Date(val);
        const formatted = d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        return (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '13px' }}>
            <span style={{ color: r.station_type === 'START' ? 'var(--start)' : 'var(--warn)', fontWeight: 600 }}>
              {r.station_type === 'START' ? '🚀 Start: ' : '⏱️ Cutoff: '}
            </span>
            {formatted}
          </div>
        );
      }
    },
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
            onClick={(e) => { e.stopPropagation(); handleDelete(r.id, r.station_name); }}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Top Category Filter Toolbar */}
      <div className="card card-pad" style={{ background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontWeight: 700, fontSize: '0.95rem' }}>เลือกระยะทาง (Category):</label>
          <select
            className="search"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            style={{ minWidth: '220px', padding: '8px 12px', fontWeight: 600 }}
          >
            {categories.length === 0 && <option value="">(ยังไม่มีระยะทางในระบบ)</option>}
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.distance_km} {c.unit})</option>
            ))}
          </select>
        </div>

        {selectedCategoryObj && (
          <div style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
            มีจุดตรวจที่ผูกในเส้นทางนี้ทั้งหมด <b>{checkpoints.length}</b> จุด
          </div>
        )}
      </div>

      {selectedCategoryId && (
        <div className="event-setup-grid">
          
          {/* Left Form */}
          <div className="card card-pad event-setup-card" style={{ background: formData.id ? '#fffbeb' : 'var(--bg-soft)', border: formData.id ? '2px solid #f59e0b' : '1px solid var(--line)', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: formData.id ? '#b45309' : 'inherit' }}>
                {formData.id ? `✏️ แก้ไขจุดตรวจ: ${checkpoints.find(c => c.id === formData.id)?.station_name || ''}` : '🔗 ผูกจุดตรวจ (Station) เข้ากับระยะนี้'}
              </h3>
              {formData.id && (
                <span style={{ fontSize: '12px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                  Edit Mode
                </span>
              )}
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Quick Edit Checkpoint Dropdown */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
                  เลือกจุดที่ผูกไว้แล้วเพื่อแก้ไขเวลา/ลำดับ:
                </label>
                <select
                  className="search"
                  value={formData.id || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    if (!selectedId) {
                      handleClear();
                    } else {
                      const found = checkpoints.find(cp => cp.id === selectedId);
                      if (found) handleEdit(found);
                    }
                  }}
                  style={{ width: '100%', padding: '8px 10px', background: formData.id ? '#fff' : 'var(--bg)', borderColor: formData.id ? '#f59e0b' : 'var(--line)', fontWeight: formData.id ? 600 : 'normal' }}
                >
                  <option value="">➕ [ ผูกจุดตรวจเพิ่ม / Link Another Station ]</option>
                  {checkpoints.map(cp => (
                    <option key={cp.id} value={cp.id}>
                      ลำดับ {cp.sequence_order}: {cp.station_name} ({cp.station_type}) {cp.cutoff_time ? `[${new Date(cp.cutoff_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ borderTop: '1px dashed var(--line)', paddingTop: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>เลือกจุดตรวจที่มีอยู่ในระบบ (Station) <span style={{ color: 'var(--warn)' }}>*</span></label>
                <select className="search" name="station_id" value={formData.station_id} onChange={handleChange} required style={{ width: '100%', padding: '8px' }}>
                  <option value="">-- เลือกจุดตรวจจากระบบ --</option>
                  {stations.map(st => (
                    <option key={st.id} value={st.id}>{st.name} ({st.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ลำดับในเส้นทาง (Sequence Order) <span style={{ color: 'var(--warn)' }}>*</span></label>
                <input className="search" type="number" name="sequence_order" value={formData.sequence_order} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
              </div>

              {currentStationObj?.type === 'START' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--start)' }}>
                    🚀 วันและเวลาปล่อยตัว (Start Date & Gun Time)
                  </label>
                  <input
                    className="search"
                    type="datetime-local"
                    name="start_time"
                    value={formData.start_time || formData.cutoff_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value, cutoff_time: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderColor: 'var(--start)' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-2)', marginTop: '2px', display: 'block' }}>
                    กำหนดวันและเวลาปล่อยตัวทางการของระยะ {selectedCategoryObj?.name}
                  </span>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>
                    ⏱️ เวลา Cut-off (ถ้ามี)
                  </label>
                  <input
                    className="search"
                    type="datetime-local"
                    name="cutoff_time"
                    value={formData.cutoff_time}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '8px' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-2)', marginTop: '2px', display: 'block' }}>
                    ระบุเวลาปิดจุดตรวจสำหรับระยะนี้ (นักวิ่งที่มาหลังเวลานี้จะ DNF)
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="submit"
                  className="btn"
                  disabled={isSaving || stations.length === 0}
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
                  {isSaving ? 'กำลังบันทึก...' : (formData.id ? '💾 บันทึกการแก้ไข' : '🔗 ผูกจุดตรวจเข้ากับระยะนี้')}
                </button>
                {formData.id && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleClear()}
                    style={{ border: '1px solid var(--line)', background: '#fff', padding: '10px', cursor: 'pointer' }}
                  >
                    ยกเลิก
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Table */}
          <div className="event-setup-table-wrap">
            {loading ? (
              <div className="card card-pad empty">กำลังโหลด...</div>
            ) : (
              <AdvancedTable columns={columns} data={checkpoints} pageSize={50} maxHeight="400px" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
