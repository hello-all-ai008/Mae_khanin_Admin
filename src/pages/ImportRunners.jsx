import React, { useState, useEffect } from 'react';
import { useRace } from '../context/RaceContext';
import { supabase } from '../lib/supabaseClient';
import { assertWriteOk } from '../lib/supabaseResult';
import AdvancedTable from '../components/AdvancedTable';
import * as XLSX from 'xlsx';

export default function ImportRunners() {
  const { addToast } = useRace();
  const [formData, setFormData] = useState({
    bib: '', cat: '', name: '', gender: '', age: '', nat: ''
  });
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState('excel'); // 'excel' | 'manual'

  // New Multi-Event State
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  // Fetch EVENTS on mount
  useEffect(() => {
    async function fetchEvents() {
      try {
        const { data: evts, error } = await supabase
          .from('events') // PostgreSQL tables are lowercase unless quoted
          .select('id, name')
          .order('start_date', { ascending: false });

        if (error) {
          // Fallback if 'events' table doesn't exist yet (e.g. not migrated)
          console.warn('Could not fetch events:', error);
          return;
        }
        if (evts && evts.length > 0) {
          setEvents(evts);
          setSelectedEventId(evts[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchEvents();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!formData.bib || !formData.cat || !formData.name || !formData.gender) {
      addToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', true);
      return;
    }
    if (!selectedEventId) {
      addToast('กรุณาเลือกงานวิ่ง (Event) ก่อนบันทึก', true);
      return;
    }

    try {
      const newRunner = {
        event_id: selectedEventId,
        bib: formData.bib,
        name: formData.name,
        gender: formData.gender,
        age: formData.age || 'N/A',
        nat: formData.nat || 'THAI',
        cat: formData.cat,
        registration_status: 'PRE_REGISTERED'
      };

      assertWriteOk(await supabase.from('runners').insert([newRunner]).select('id'));

      addToast('เพิ่มข้อมูลสำเร็จ', false);
      setFormData({ bib: '', cat: '', name: '', gender: '', age: '', nat: '' });
    } catch (err) {
      addToast(`เกิดข้อผิดพลาด: ${err.message}`, true);
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Clear previous input so you can upload the same file again if needed
    e.target.value = null;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (json.length === 0) {
        setMsg('ไฟล์ไม่มีข้อมูล');
        return;
      }
      const headerRow = json[0];
      // Map based on the provided template format
      const rows = json.slice(1).filter(r => r.length > 0).map(row => {
        const title = String(row[1] || '').trim();
        const fullName = String(row[2] || '').trim();
        const name = fullName;

        const rawCat = String(row[4] || '').trim();
        let distance = null;
        let unit = '';
        let cat_name = rawCat;

        // Match e.g., "10 KM : Hard Rock"
        const catMatch = rawCat.match(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$/);
        if (catMatch) {
          distance = parseFloat(catMatch[1]);
          unit = catMatch[2];
          cat_name = catMatch[3].trim();
        }

        return {
          _no: String(row[0] || ''), // Store NO just for display
          bib: null, // Left as null for auto-gen later
          title: title,
          name: name,
          gender: String(row[3] || '').trim() || 'M',
          cat: rawCat,
          distance: distance,
          unit: unit,
          cat_name: cat_name,
          payment_status: String(row[5] || '').trim(),
          age_group: String(row[6] || '').trim() || 'N/A',
          age: String(row[6] || '').trim() || 'N/A',
          nat: 'THAI'
        };
      });

      setHeaders(headerRow);
      setData(rows);
      setMsg(`พบข้อมูล ${rows.length} รายการ (ยังไม่ได้บันทึก กรุณาตรวจสอบแล้วกดยืนยัน)`);
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmUpload = async () => {
    if (data.length === 0) return;
    if (!selectedEventId) {
      setMsg('❌ กรุณาเลือกงานวิ่ง (Event) ก่อนบันทึกข้อมูล');
      addToast('กรุณาเลือกงานวิ่งก่อนบันทึก', true);
      return;
    }

    setMsg('กำลังตรวจสอบ Categories ในระบบ...');
    try {
      // 1. Find all unique categories from the parsed data
      const uniqueCats = [];
      const catMap = new Map();

      data.forEach(row => {
        if (!catMap.has(row.cat)) {
          catMap.set(row.cat, {
            name: row.cat_name,
            distance_km: row.distance || 0,
            unit: row.unit || 'km'
          });
          uniqueCats.push(row.cat);
        }
      });

      // 2. Fetch existing categories for this event
      const { data: existingCats, error: fetchCatsError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('event_id', selectedEventId);

      if (fetchCatsError) throw fetchCatsError;

      const existingCatMap = new Map(existingCats.map(c => [c.name, c.id]));
      const newCatsToInsert = [];

      // 3. Prepare new categories to insert
      uniqueCats.forEach(cat => {
        const catInfo = catMap.get(cat);
        if (!existingCatMap.has(catInfo.name)) {
          newCatsToInsert.push({
            event_id: selectedEventId,
            name: catInfo.name,
            distance_km: catInfo.distance_km,
            unit: catInfo.unit
          });
        }
      });

      // 4. Insert new categories
      if (newCatsToInsert.length > 0) {
        setMsg(`กำลังสร้าง Categories ใหม่ ${newCatsToInsert.length} รายการ...`);
        const insertedCats = assertWriteOk(
          await supabase.from('categories').insert(newCatsToInsert).select('id, name')
        );
        insertedCats.forEach(c => existingCatMap.set(c.name, c.id));
      }

      setMsg('กำลังอัปโหลดข้อมูลนักวิ่ง...');

      // 5. Prepare runners data
      const runnersToInsert = data.map(row => ({
        event_id: selectedEventId,
        bib: null, // Null as requested, to be assigned later
        title: row.title,
        name: row.name,
        gender: row.gender,
        age: row.age,
        age_group: row.age_group,
        cat: row.cat,
        distance: row.distance,
        unit: row.unit,
        cat_name: row.cat_name,
        nat: row.nat,
        payment_status: row.payment_status,
        category_id: existingCatMap.get(row.cat_name),
        registration_status: 'PRE_REGISTERED'
      }));

      // 6. Insert runners (Batch insert). Count the rows the database kept.
      const insertedRunners = assertWriteOk(
        await supabase.from('runners').insert(runnersToInsert).select('id')
      );

      setMsg(`✅ อัปโหลด Excel เข้า Database สำเร็จ ${insertedRunners.length} รายการ!`);
      addToast(`อัปโหลด Excel สำเร็จ ${insertedRunners.length} รายการ`, false);

      // Clear data after successful insert
      setData([]);
    } catch (err) {
      console.error('Supabase upload error:', err);
      addToast(`อัปโหลดไม่สำเร็จ: ${err.message}`, true);
      setMsg(`❌ อัปโหลดไม่สำเร็จ: ${err.message}`);
    }
  };

  const tableColumns = [
    { key: '_no', label: 'NO' },
    { key: 'title', label: 'Title' },
    { key: 'name', label: 'Name' },
    { key: 'gender', label: 'Gender' },
    { key: 'age_group', label: 'Age Group' },
    { key: 'distance', label: 'Distance', defaultWidth: 150 },
    { key: 'unit', label: 'Unit', defaultWidth: 150 },
    { key: 'cat_name', label: 'Category', defaultWidth: 200 },
    {
      key: 'payment_status', label: 'Status', defaultWidth: 180, render: (val) => (
        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: val?.toLowerCase().includes('paid') ? '#dcfce7' : 'var(--border)', color: val?.toLowerCase().includes('paid') ? '#166534' : 'var(--ink)' }}>
          {val || 'N/A'}
        </span>
      )
    },
    {
      key: 'bib', label: 'BIB', defaultWidth: 150, render: () => (
        <span style={{ color: 'var(--warn)', fontWeight: 600, fontSize: '0.75rem' }}>NULL</span>
      )
    }
  ];

  return (
    <div className="page active" style={{ padding: '24px 32px' }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <span className="eyebrow">Data Management</span>
          <h1 style={{ marginBottom: '4px' }}>เพิ่มข้อมูลนักวิ่ง (Import / Add)</h1>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>เพิ่มนักวิ่งรายบุคคล หรืออัปโหลดไฟล์ Excel เพื่อเข้าสู่ฐานข้อมูล (ตาม Event)</p>
        </div>
      </div>

      {/* ── Event Selection Toolbar ── */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '1.25rem', background: 'var(--bg-soft)', border: '1px solid var(--primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label style={{ fontWeight: 600, color: 'var(--ink)' }}>1. เลือกงานวิ่ง (Event):</label>
          <select
            className="search"
            style={{ padding: '8px 16px', minWidth: '240px', fontWeight: 600, fontSize: '0.95rem' }}
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
          >
            {events.length === 0 ? (
              <option value="">-- ไม่พบงานวิ่งในระบบ (กรุณาสร้างก่อน) --</option>
            ) : (
              events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)
            )}
          </select>
          {events.length === 0 && <span style={{ color: 'var(--warn)', fontSize: '0.85rem' }}>* ต้องสร้าง Event ก่อนอัปโหลด</span>}
        </div>
      </div>

      {/* ── Toolbar: tab buttons ── */}
      <div className="card" style={{ padding: '8px 12px', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('excel')}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
              background: activeTab === 'excel' ? 'var(--ink)' : 'transparent',
              color: activeTab === 'excel' ? '#fff' : 'var(--ink-2)',
              transition: 'all .15s',
            }}
          >
            📄 2. นำเข้าจาก Excel
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
              background: activeTab === 'manual' ? 'var(--ink)' : 'transparent',
              color: activeTab === 'manual' ? '#fff' : 'var(--ink-2)',
              transition: 'all .15s',
            }}
          >
            ✍️ เพิ่มแบบ Manual
          </button>
        </div>
      </div>

      {/* ── Tab: Excel Import ── */}
      {activeTab === 'excel' && (
        <div className="card card-pad" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '18px', margin: 0 }}>อัปโหลดไฟล์ Excel</h2>
            {data.length > 0 && (
              <button className="btn" style={{ background: 'var(--primary)', color: '#000', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleConfirmUpload} disabled={!selectedEventId}>
                ✅ ยืนยันการบันทึกข้อมูลเข้าฐานข้อมูล ({data.length})
              </button>
            )}
          </div>

          <div style={{ border: '2px dashed var(--line)', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', color: 'var(--ink-2)', background: 'var(--bg-soft)', transition: 'all 0.2s', cursor: 'pointer' }} onClick={() => document.getElementById('file-excel').click()}>
            <div style={{ fontSize: '3rem', marginBottom: '10px', opacity: 0.5 }}>📁</div>
            <p style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 500, color: 'var(--ink)' }}>คลิกเพื่อเลือกไฟล์ Excel (.xlsx / .xls)</p>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', opacity: 0.8 }}>รูปแบบตาราง: ลำดับ | คำนำหน้า | ชื่อ นามสกุล | เพศ | ระยะ | สถานะชำระ | รุ่นอายุ</p>
            <input type="file" id="file-excel" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} />
            <button className="btn" style={{ background: 'var(--border)', color: 'var(--ink)' }} onClick={(e) => { e.stopPropagation(); document.getElementById('file-excel').click(); }}>
              เลือกไฟล์ Excel
            </button>
          </div>

          {msg && (
            <div style={{ marginTop: '15px', padding: '12px', background: 'var(--bg-soft)', borderRadius: '8px', borderLeft: '4px solid var(--primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {msg}
            </div>
          )}

          {data.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <AdvancedTable
                columns={tableColumns}
                data={data}
                pageSize={50}
                maxHeight="600px"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Manual Entry ── */}
      {activeTab === 'manual' && (
        <div className="card card-pad" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '18px', margin: '0 0 8px 0' }}>เพิ่มรายบุคคล</h2>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-2)' }}>กรอกข้อมูลนักวิ่งเพื่อเพิ่มเข้าสู่ระบบโดยตรง</p>
          </div>

          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleManualSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500, color: 'var(--ink)' }}>BIB <span style={{ color: 'var(--warn)' }}>*</span></label>
                <input type="text" className="search" name="bib" value={formData.bib} onChange={handleChange} placeholder="เช่น 1001" required style={{ width: '100%', padding: '10px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500, color: 'var(--ink)' }}>ระยะทาง (Category) <span style={{ color: 'var(--warn)' }}>*</span></label>
                <input type="text" className="search" name="cat" value={formData.cat} onChange={handleChange} placeholder="เช่น MKT10" required style={{ width: '100%', padding: '10px' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500, color: 'var(--ink)' }}>ชื่อ-นามสกุล <span style={{ color: 'var(--warn)' }}>*</span></label>
                <input type="text" className="search" name="name" value={formData.name} onChange={handleChange} placeholder="ชื่อ นามสกุล" required style={{ width: '100%', padding: '10px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500, color: 'var(--ink)' }}>เพศ <span style={{ color: 'var(--warn)' }}>*</span></label>
                <select className="search" name="gender" value={formData.gender} onChange={handleChange} required style={{ width: '100%', padding: '10px' }}>
                  <option value="">เลือกเพศ</option>
                  <option value="M">ชาย (Male)</option>
                  <option value="F">หญิง (Female)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500, color: 'var(--ink)' }}>อายุ (Age)</label>
                <input type="number" className="search" name="age" value={formData.age} onChange={handleChange} placeholder="เช่น 35" style={{ width: '100%', padding: '10px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500, color: 'var(--ink)' }}>สัญชาติ (Nationality)</label>
                <input type="text" className="search" name="nat" value={formData.nat} onChange={handleChange} placeholder="เช่น THAI" style={{ width: '100%', padding: '10px' }} />
              </div>
            </div>

            <button type="submit" className="btn" style={{ background: 'var(--primary)', color: '#000', padding: '12px', marginTop: '8px', fontSize: '1rem', fontWeight: 600 }}>
              บันทึกข้อมูล
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
