import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function EditRunnerModal({ isOpen, onClose, runner, onSave, eventId }) {
  const [formData, setFormData] = useState({
    bib: '',
    name: '',
    cat: '',
    gender: '',
    age: '',
    nat: '',
    registration_status: ''
  });
  const [categories, setCategories] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && runner) {
      setFormData({
        bib: runner.bib || '',
        name: runner.name || '',
        cat: runner.cat || '',
        gender: runner.gender || '',
        age: runner.age || '',
        nat: runner.nat || '',
        registration_status: runner.registration_status || 'PRE_REGISTERED'
      });
      fetchCategories();
      fetchAgeGroups();
    }
  }, [isOpen, runner]);

  const fetchCategories = async () => {
    if (!eventId) return;
    const { data } = await supabase.from('categories').select('name').eq('event_id', eventId);
    if (data) setCategories(data.map(c => c.name));
  };

  const fetchAgeGroups = async () => {
    if (!eventId) return;
    const { data } = await supabase.from('runners').select('age').eq('event_id', eventId);
    if (data) {
      const uniqueAges = [...new Set(data.map(r => r.age).filter(Boolean))].sort();
      setAgeGroups(uniqueAges);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('runners')
        .update({
          bib: formData.bib,
          name: formData.name,
          cat: formData.cat,
          gender: formData.gender,
          age: formData.age,
          nat: formData.nat,
          registration_status: formData.registration_status
        })
        .eq('id', runner.id);
        
      if (error) throw error;
      
      onSave({ ...runner, ...formData });
      onClose();
    } catch (err) {
      console.error(err);
      alert(`บันทึกไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div className="card" style={{
        background: 'var(--bg)',
        width: '500px',
        maxWidth: '90%',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ✏️ แก้ไขข้อมูลนักวิ่ง
        </h3>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>BIB</label>
              <input className="search" type="text" name="bib" value={formData.bib} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>หมวดหมู่ (Category)</label>
              <select className="search" name="cat" value={formData.cat} onChange={handleChange} required style={{ width: '100%', padding: '8px' }}>
                <option value="">เลือกหมวดหมู่</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>ชื่อ-นามสกุล</label>
            <input className="search" type="text" name="name" value={formData.name} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>เพศ</label>
              <select className="search" name="gender" value={formData.gender} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
                <option value="">เลือก</option>
                <option value="M">ชาย (M)</option>
                <option value="F">หญิง (F)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>กลุ่มอายุ</label>
              <input className="search" type="text" name="age" list="age-groups-list" value={formData.age} onChange={handleChange} placeholder="เช่น 20-29" style={{ width: '100%', padding: '8px' }} />
              <datalist id="age-groups-list">
                {ageGroups.map(age => <option key={age} value={age} />)}
              </datalist>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>สัญชาติ</label>
            <input className="search" type="text" name="nat" value={formData.nat} onChange={handleChange} placeholder="เช่น THAI" style={{ width: '100%', padding: '8px' }} />
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>สถานะการสมัคร</label>
            <select className="search" name="registration_status" value={formData.registration_status} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
              <option value="PRE_REGISTERED">PRE_REGISTERED (สมัครแล้ว/รอยืนยัน)</option>
              <option value="CONFIRMED">CONFIRMED (ยืนยันแล้ว)</option>
              <option value="CANCELLED">CANCELLED (ยกเลิก)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button 
              type="button"
              className="btn" 
              onClick={onClose}
              style={{ padding: '8px 16px', background: 'var(--line)', color: 'var(--ink)', border: 'none' }}
              disabled={isSaving}
            >
              ยกเลิก
            </button>
            <button 
              type="submit"
              className="btn" 
              style={{ padding: '8px 16px', background: 'var(--primary)', color: '#000', border: 'none', fontWeight: 600 }}
              disabled={isSaving}
            >
              {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
