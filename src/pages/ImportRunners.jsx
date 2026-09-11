import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRace } from '../context/RaceContext';
import { supabase } from '../lib/supabaseClient';
import { assertWriteOk } from '../lib/supabaseResult';
import { fetchAllRows } from '../lib/supabaseFetch';
import AdvancedTable from '../components/AdvancedTable';
import * as XLSX from 'xlsx';

export default function ImportRunners() {
  const { addToast, updateRunner, preloadEventData } = useRace();
  const [formData, setFormData] = useState({
    bib: '', cat: '', cat_name: '', category_id: '', distance: null, unit: 'KM', name: '', gender: '', age: '', nat: 'THAI', registration_status: 'PRE_REGISTERED'
  });
  const [customAge, setCustomAge] = useState('');
  const [isCustomAge, setIsCustomAge] = useState(false);
  const [customNat, setCustomNat] = useState('');
  const [isCustomNat, setIsCustomNat] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);

  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState('excel'); // 'excel' | 'manual'

  // Multi-Event State
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  // DB Reference Data State
  const [dbCategories, setDbCategories] = useState([]);
  const [dbRunners, setDbRunners] = useState([]);
  const [dbAgeGroups, setDbAgeGroups] = useState([]);
  const [dbNationalities, setDbNationalities] = useState(['THAI']);
  const [dbGenders, setDbGenders] = useState(['Male', 'Female']);
  const [loadingRefData, setLoadingRefData] = useState(false);

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

  // Fetch Reference Data (Categories, Runners, Ages, Nationalities) from DB whenever selectedEventId changes
  const loadEventReferenceData = useCallback(async (eventId) => {
    if (!eventId) return;
    setLoadingRefData(true);
    try {
      // 1. Fetch Categories for this event
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name, color, distance_km, unit')
        .eq('event_id', eventId)
        .order('distance_km', { ascending: true });

      if (catError) console.warn('Could not fetch categories:', catError);

      // 2. Fetch existing runners for this event to extract age groups, nats, and bibs
      const { data: runnerRows, error: runError } = await fetchAllRows((from, to) =>
        supabase
          .from('runners')
          .select('id, bib, name, cat, cat_name, gender, age, age_group, nat, category_id, distance, unit')
          .eq('event_id', eventId)
          .order('id', { ascending: true })
          .range(from, to)
      );

      if (runError) console.warn('Could not fetch runners reference:', runError);
      const cleanRunners = (runnerRows || []).filter(
        r => r.bib !== 'RUNNER_CONFIG' && !String(r.bib || '').startsWith('__')
      );
      setDbRunners(cleanRunners);

      // Merge categories from categories table and runners table
      const catMap = new Map();
      const registerCat = (rawName, id, dist, unit, color) => {
        if (!rawName) return;
        let cleanName = rawName;
        let d = dist != null && !isNaN(Number(dist)) ? Number(dist) : null;
        let u = (unit || 'KM').toUpperCase();
        const match = rawName.match(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$/);
        if (match) {
          if (d == null) d = parseFloat(match[1]);
          if (!u || u === 'K' || u === 'KM') u = match[2].toUpperCase();
          cleanName = match[3].trim();
        } else {
          cleanName = rawName.replace(/\s*\([\d.]+\s*[a-zA-Z]*\)/g, '').trim();
        }
        if (!u || u === 'K') u = 'KM';

        if (cleanName && !catMap.has(cleanName)) {
          catMap.set(cleanName, {
            id: id || null,
            name: cleanName,
            distance_km: d,
            unit: u,
            color: color || null
          });
        }
      };

      (catData || []).forEach(c => registerCat(c.name, c.id, c.distance_km, c.unit, c.color));
      cleanRunners.forEach(r => registerCat(r.cat_name || r.cat, r.category_id, r.distance, r.unit, null));
      const resolvedCats = Array.from(catMap.values());
      setDbCategories(resolvedCats);

      // Extract unique age groups and ages from DB
      const ageSet = new Set();
      cleanRunners.forEach(r => {
        if (r.age_group && r.age_group !== 'N/A' && r.age_group !== '-') ageSet.add(r.age_group);
        if (r.age && r.age !== 'N/A' && r.age !== '-') ageSet.add(r.age);
      });
      const sortedAges = Array.from(ageSet).sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true })
      );
      setDbAgeGroups(sortedAges);

      // Extract unique nationalities from DB
      const natSet = new Set(['THAI']);
      cleanRunners.forEach(r => {
        if (r.nat && r.nat.trim()) natSet.add(r.nat.trim().toUpperCase());
      });
      ['JPN', 'CHN', 'USA', 'GBR', 'FRA', 'GER', 'AUS', 'SGP', 'MYS'].forEach(n => natSet.add(n));
      setDbNationalities(Array.from(natSet).sort());

      // Extract unique genders from DB (ensuring English only: Male / Female)
      const genderSet = new Set(['Male', 'Female']);
      cleanRunners.forEach(r => {
        if (r.gender && r.gender.trim()) {
          const g = r.gender.trim();
          if (g.toLowerCase() === 'male' || g === 'M' || g === 'ชาย' || g === 'ชาย (Male)') {
            genderSet.add('Male');
          } else if (g.toLowerCase() === 'female' || g === 'F' || g === 'หญิง' || g === 'หญิง (Female)') {
            genderSet.add('Female');
          } else if (/^[a-zA-Z\s]+$/.test(g)) {
            genderSet.add(g);
          }
        }
      });
      setDbGenders(Array.from(genderSet));
    } catch (err) {
      console.error('Error loading event reference data:', err);
    } finally {
      setLoadingRefData(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadEventReferenceData(selectedEventId);
    }
  }, [selectedEventId, loadEventReferenceData]);

  // Check duplicate BIB in real-time
  const duplicateRunner = useMemo(() => {
    if (!formData.bib || !dbRunners.length) return null;
    const cleanBib = String(formData.bib).trim().toLowerCase();
    return dbRunners.find(r => String(r.bib || '').trim().toLowerCase() === cleanBib) || null;
  }, [formData.bib, dbRunners]);

  // Suggest next available BIB
  const handleSuggestNextBib = () => {
    if (!dbRunners.length) {
      setFormData(prev => ({ ...prev, bib: '1001' }));
      return;
    }
    let candidates = dbRunners;
    if (formData.cat) {
      const catFiltered = dbRunners.filter(r => r.cat === formData.cat || r.cat_name === formData.cat_name);
      if (catFiltered.length > 0) candidates = catFiltered;
    }
    const numericBibs = candidates
      .map(r => parseInt(String(r.bib).replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n) && n > 0);

    if (numericBibs.length > 0) {
      const maxBib = Math.max(...numericBibs);
      setFormData(prev => ({ ...prev, bib: String(maxBib + 1) }));
    } else {
      setFormData(prev => ({ ...prev, bib: '1001' }));
    }
  };

  const handleCategorySelect = (e) => {
    const selectedName = e.target.value;
    const catObj = dbCategories.find(c => c.name === selectedName);

    let cleanCatName = selectedName;
    let dist = catObj?.distance_km != null && !isNaN(Number(catObj.distance_km)) ? Number(catObj.distance_km) : null;
    let u = (catObj?.unit || '').trim().toUpperCase() || 'KM';
    if (u === 'K') u = 'KM';

    const fullMatch = selectedName.match(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$/);
    if (fullMatch) {
      if (dist == null) dist = parseFloat(fullMatch[1]);
      u = fullMatch[2].toUpperCase();
      cleanCatName = fullMatch[3].trim();
    } else {
      if (dist == null) {
        const numMatch = selectedName.match(/([\d.]+)\s*([a-zA-Z]*)/);
        if (numMatch && numMatch[1]) {
          dist = parseFloat(numMatch[1]);
          if (numMatch[2]) u = numMatch[2].toUpperCase();
        }
      }
      cleanCatName = selectedName.replace(/\s*\([\d.]+\s*[a-zA-Z]*\)/g, '').trim();
    }

    if (!u || u === 'K' || u === 'KM') u = 'KM';

    const formattedCat = (dist != null && !isNaN(dist))
      ? `${dist} ${u} : ${cleanCatName}`
      : cleanCatName;

    setFormData(prev => ({
      ...prev,
      cat: formattedCat,
      cat_name: cleanCatName,
      category_id: catObj?.id || '',
      distance: dist,
      unit: u
    }));
  };

  const handleAgeSelect = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomAge(true);
      setFormData(prev => ({ ...prev, age: '' }));
    } else {
      setIsCustomAge(false);
      setFormData(prev => ({ ...prev, age: val }));
    }
  };

  const handleNatSelect = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomNat(true);
      setFormData(prev => ({ ...prev, nat: '' }));
    } else {
      setIsCustomNat(false);
      setFormData(prev => ({ ...prev, nat: val }));
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const finalAge = isCustomAge ? customAge.trim() : formData.age.trim();
    const finalNat = isCustomNat ? customNat.trim() : formData.nat.trim();

    if (!formData.bib || (!formData.cat && !formData.cat_name) || !formData.name || !formData.gender) {
      addToast('กรุณากรอกและเลือกข้อมูลที่จำเป็นให้ครบถ้วน', true);
      return;
    }
    if (!selectedEventId) {
      addToast('กรุณาเลือกงานวิ่ง (Event) ก่อนบันทึก', true);
      return;
    }
    if (duplicateRunner) {
      addToast(`หมายเลข BIB ${formData.bib} ซ้ำกับนักวิ่งที่มีอยู่ในระบบแล้ว (${duplicateRunner.name})`, true);
      return;
    }

    setIsSavingManual(true);
    try {
      // Ensure gender is saved in English only (Male / Female)
      let finalGender = (formData.gender || '').trim();
      if (finalGender === 'M' || finalGender.toLowerCase() === 'male' || finalGender === 'ชาย' || finalGender === 'ชาย (Male)') {
        finalGender = 'Male';
      } else if (finalGender === 'F' || finalGender.toLowerCase() === 'female' || finalGender === 'หญิง' || finalGender === 'หญิง (Female)') {
        finalGender = 'Female';
      } else if (!finalGender) {
        finalGender = 'Male';
      }

      // Format cat and cat_name:
      // cat: "[distance] KM : [cat_name]" (e.g. "5 KM : Soft Rock")
      // cat_name: "[cat_name]" (e.g. "Soft Rock")
      let catName = formData.cat_name || formData.cat || '';
      let dist = typeof formData.distance === 'number' && !isNaN(formData.distance) ? formData.distance : null;
      let u = (formData.unit || 'KM').toUpperCase();
      if (u === 'K') u = 'KM';

      const fullMatch = catName.match(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$/);
      if (fullMatch) {
        if (dist == null) dist = parseFloat(fullMatch[1]);
        u = fullMatch[2].toUpperCase();
        catName = fullMatch[3].trim();
      } else {
        catName = catName.replace(/\s*\([\d.]+\s*[a-zA-Z]*\)/g, '').trim();
      }

      const formattedCat = (dist != null && !isNaN(dist))
        ? `${dist} ${u} : ${catName}`
        : catName;

      const newRunner = {
        event_id: selectedEventId,
        bib: String(formData.bib).trim(),
        name: String(formData.name).trim(),
        gender: finalGender,
        age: finalAge || 'N/A',
        age_group: finalAge || 'N/A',
        nat: finalNat || 'THAI',
        cat: formattedCat,
        cat_name: catName,
        ...(formData.category_id ? { category_id: formData.category_id } : {}),
        distance: dist,
        unit: u,
        registration_status: formData.registration_status || 'PRE_REGISTERED'
      };

      const inserted = assertWriteOk(
        await supabase.from('runners').insert([newRunner]).select('*')
      );
      const savedRunner = inserted[0] || newRunner;

      addToast(`✓ เพิ่มนักวิ่ง BIB ${newRunner.bib} (${newRunner.name}) เรียบร้อย`, false);

      // Update local cache and RaceContext
      setDbRunners(prev => [...prev, savedRunner]);
      if (typeof updateRunner === 'function') {
        updateRunner(savedRunner);
      }
      if (typeof preloadEventData === 'function') {
        preloadEventData(selectedEventId, true);
      }

      // Reset form but retain selected event and category for easy continuous entry
      setFormData(prev => ({
        ...prev,
        bib: '',
        name: '',
        gender: '',
        age: '',
        nat: 'THAI',
        distance: null,
        unit: 'KM',
        registration_status: 'PRE_REGISTERED'
      }));
      setCustomAge('');
      setIsCustomAge(false);
      setCustomNat('');
      setIsCustomNat(false);
    } catch (err) {
      console.error(err);
      addToast(`เกิดข้อผิดพลาด: ${err.message}`, true);
    } finally {
      setIsSavingManual(false);
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
    { key: '_no', label: 'NO', defaultWidth: 140 },
    { key: 'title', label: 'Title', defaultWidth: 150 },
    { key: 'name', label: 'Name', defaultWidth: 280 },
    { key: 'gender', label: 'Gender', defaultWidth: 160 },
    { key: 'age_group', label: 'Age Group', defaultWidth: 180 },
    { key: 'distance', label: 'Distance', defaultWidth: 230 },
    { key: 'unit', label: 'Unit', defaultWidth: 230 },
    { key: 'cat_name', label: 'Category', defaultWidth: 280 },
    {
      key: 'payment_status', label: 'Status', defaultWidth: 260, render: (val) => (
        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: val?.toLowerCase().includes('paid') ? '#dcfce7' : 'var(--border)', color: val?.toLowerCase().includes('paid') ? '#166534' : 'var(--ink)' }}>
          {val || 'N/A'}
        </span>
      )
    },
    {
      key: 'bib', label: 'BIB', defaultWidth: 230, render: () => (
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

      {/* ── Tab: Manual Entry (Database-Backed Dropdowns) ── */}
      {activeTab === 'manual' && (
        <div className="card card-pad" style={{ maxWidth: '680px', margin: '0 auto', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span>✍️</span> เพิ่มนักวิ่งรายบุคคล (Manual Entry)
            </h2>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-2)' }}>
              รายการข้อมูลดึงจากฐานข้อมูลของ Event ที่เลือก คลิกเลือกได้ทันทีโดยไม่ต้องพิมพ์เอง
            </p>
            {/* DB Reference Status Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 14px',
              background: 'var(--bg-soft)',
              borderRadius: '20px',
              fontSize: '0.8rem',
              color: 'var(--ink)',
              marginTop: '10px',
              border: '1px solid var(--border)'
            }}>
              <span>📌 ระยะในระบบ: <b>{loadingRefData ? '...' : dbCategories.length}</b> รุ่น</span>
              <span>•</span>
              <span>👥 นักวิ่งในระบบ: <b>{loadingRefData ? '...' : dbRunners.length}</b> คน</span>
              <span>•</span>
              <span>🎂 กลุ่มอายุ: <b>{loadingRefData ? '...' : dbAgeGroups.length}</b> กลุ่ม</span>
            </div>
          </div>

          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleManualSubmit}>
            {/* 1. Category (ระยะทาง / หมวดหมู่) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                1. ระยะทาง / หมวดหมู่ (Category) <span style={{ color: 'var(--warn)' }}>*</span>
              </label>
              <select
                className="search"
                name="cat"
                value={formData.cat_name || (formData.cat ? formData.cat.replace(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*/, '').trim() : '')}
                onChange={handleCategorySelect}
                required
                style={{ width: '100%', padding: '10px 12px', fontSize: '0.95rem', fontWeight: 600 }}
              >
                <option value="">-- คลิกเลือกหมวดหมู่จากฐานข้อมูล ({dbCategories.length} รายการ) --</option>
                {dbCategories.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.distance_km ? `${c.distance_km} ${c.unit || 'KM'} : ` : ''}{c.name}
                  </option>
                ))}
              </select>
              {dbCategories.length === 0 && !loadingRefData && (
                <span style={{ fontSize: '0.8rem', color: 'var(--warn)', marginTop: '4px', display: 'block' }}>
                  * ยังไม่พบหมวดหมู่ใน Event นี้ (สามารถสร้างในเมนู Categories Setup หรือจะดึงตามที่นักวิ่งลงทะเบียนไว้)
                </span>
              )}
            </div>

            {/* 2. BIB & Quick Suggester */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink)' }}>
                  2. หมายเลข BIB <span style={{ color: 'var(--warn)' }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSuggestNextBib}
                  style={{
                    background: 'none',
                    border: '1px solid var(--primary)',
                    borderRadius: '6px',
                    padding: '3px 10px',
                    fontSize: '0.8rem',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="หาหมายเลข BIB ถัดไปจากฐานข้อมูลอัตโนมัติ"
                >
                  ⚡ แนะนำ BIB ถัดไป (Auto)
                </button>
              </div>
              <input
                type="text"
                className="search"
                name="bib"
                value={formData.bib}
                onChange={handleChange}
                placeholder="เช่น 1001"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderColor: duplicateRunner ? '#ef4444' : undefined,
                  backgroundColor: duplicateRunner ? '#fef2f2' : undefined
                }}
              />
              {duplicateRunner && (
                <div style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: '#fee2e2',
                  color: '#991b1b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  ⚠️ หมายเลข BIB {formData.bib} มีอยู่ในระบบแล้ว: {duplicateRunner.name} ({duplicateRunner.cat || 'ไม่ระบุรุ่น'})
                </div>
              )}
            </div>

            {/* 3. Name & Quick Titles */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink)' }}>
                  3. ชื่อ-นามสกุล <span style={{ color: 'var(--warn)' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {['นาย', 'นาง', 'นางสาว', 'Mr.', 'Ms.'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (!formData.name.startsWith(t)) {
                          setFormData(prev => ({
                            ...prev,
                            name: `${t} ${prev.name.replace(/^(นาย|นาง|นางสาว|Mr\.|Ms\.)\s*/, '')}`.trim()
                          }));
                        }
                      }}
                      style={{
                        padding: '2px 6px',
                        fontSize: '0.72rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-soft)',
                        cursor: 'pointer'
                      }}
                    >
                      +{t}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                className="search"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="กรอกชื่อ นามสกุล"
                required
                style={{ width: '100%', padding: '10px 12px' }}
              />
            </div>

            {/* 4. Gender & Age Group Dropdowns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                  4. เพศ (Gender - English) <span style={{ color: 'var(--warn)' }}>*</span>
                </label>
                <select
                  className="search"
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '10px 12px' }}
                >
                  <option value="">-- เลือกเพศ (Male / Female) --</option>
                  {dbGenders.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                  5. รุ่นอายุ / อายุ
                </label>
                <select
                  className="search"
                  name="age"
                  value={isCustomAge ? '__custom__' : formData.age}
                  onChange={handleAgeSelect}
                  style={{ width: '100%', padding: '10px 12px' }}
                >
                  <option value="">-- เลือกรุ่นอายุจาก DB ({dbAgeGroups.length} กลุ่ม) --</option>
                  {dbAgeGroups.map(ag => (
                    <option key={ag} value={ag}>{ag}</option>
                  ))}
                  <option value="__custom__">✏️ กำหนดเอง (Custom)...</option>
                </select>
                {isCustomAge && (
                  <input
                    type="text"
                    className="search"
                    placeholder="พิมพ์อายุหรือรุ่นอายุ เช่น 35 หรือ 30-39"
                    value={customAge}
                    onChange={e => setCustomAge(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', marginTop: '6px' }}
                  />
                )}
              </div>
            </div>

            {/* 5. Nationality & Registration Status Dropdowns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                  6. สัญชาติ (Nationality)
                </label>
                <select
                  className="search"
                  name="nat"
                  value={isCustomNat ? '__custom__' : formData.nat}
                  onChange={handleNatSelect}
                  style={{ width: '100%', padding: '10px 12px' }}
                >
                  <option value="THAI">THAI (ไทย)</option>
                  {dbNationalities.filter(n => n !== 'THAI').map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                  <option value="__custom__">✏️ อื่นๆ (Custom)...</option>
                </select>
                {isCustomNat && (
                  <input
                    type="text"
                    className="search"
                    placeholder="ระบุสัญชาติ เช่น USA"
                    value={customNat}
                    onChange={e => setCustomNat(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', marginTop: '6px' }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', marginBottom: '6px', fontWeight: 600, color: 'var(--ink)' }}>
                  7. สถานะการสมัคร
                </label>
                <select
                  className="search"
                  name="registration_status"
                  value={formData.registration_status}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '10px 12px' }}
                >
                  <option value="PRE_REGISTERED">PRE_REGISTERED (สมัครแล้ว / รอเช็คอิน)</option>
                  <option value="CHECKED_IN">CHECKED_IN (เช็คอินแล้ว)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="btn"
              disabled={isSavingManual || !!duplicateRunner}
              style={{
                background: duplicateRunner ? '#94a3b8' : 'var(--primary)',
                color: '#000',
                padding: '12px',
                marginTop: '10px',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: duplicateRunner ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isSavingManual ? '⏳ กำลังบันทึก...' : '💾 บันทึกข้อมูลนักวิ่งเข้าฐานข้อมูล'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
