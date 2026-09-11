import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { assertWriteOk } from '../lib/supabaseResult';

export default function EditRunnerModal({
  isOpen,
  onClose,
  runner,
  existingRunners = [],
  existingCategories = [],
  catColorMap = {},
  onSave,
  eventId
}) {
  const [formData, setFormData] = useState({
    bib: '',
    name: '',
    cat: '',
    cat_name: '',
    category_id: '',
    distance: null,
    unit: 'KM',
    gender: '',
    age: '',
    nat: 'THAI',
    registration_status: 'PRE_REGISTERED'
  });

  const [customAge, setCustomAge] = useState('');
  const [isCustomAge, setIsCustomAge] = useState(false);
  const [customNat, setCustomNat] = useState('');
  const [isCustomNat, setIsCustomNat] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Standalone fallback fetch state (used only if parent passed no existingRunners/existingCategories)
  const [fallbackCategories, setFallbackCategories] = useState([]);
  const [fallbackRunners, setFallbackRunners] = useState([]);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const fallbackFetchedRef = useRef(false);

  const effectiveEventId = runner?.event_id || eventId;

  // Derive DB Reference Data instantly from props (0 network overhead, prevents infinite loops & network jamming)
  const dbRunners = useMemo(() => {
    const list = existingRunners && existingRunners.length > 0 ? existingRunners : fallbackRunners;
    return (list || []).filter(
      r => r && r.bib !== 'RUNNER_CONFIG' && !String(r.bib || '').startsWith('__')
    );
  }, [existingRunners, fallbackRunners]);

  const dbCategories = useMemo(() => {
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
      } else if (cleanName && catMap.has(cleanName)) {
        const existing = catMap.get(cleanName);
        if (existing.distance_km == null && d != null) existing.distance_km = d;
        if (!existing.id && id) existing.id = id;
        if (!existing.color && color) existing.color = color;
      }
    };

    // 1. From existingCategories passed by parent
    (existingCategories || []).forEach(c => {
      const name = typeof c === 'string' ? c : c?.name;
      const id = typeof c === 'object' ? c.id || null : null;
      const dist = typeof c === 'object' ? c.distance_km : null;
      const unit = typeof c === 'object' ? c.unit : 'KM';
      registerCat(name, id, dist, unit, catColorMap?.[name]);
    });

    // 2. From fallbackCategories (if standalone fetch was needed)
    (fallbackCategories || []).forEach(c => {
      if (c && c.name) {
        registerCat(c.name, c.id, c.distance_km, c.unit, c.color);
      }
    });

    // 3. Supplement from existing runners
    dbRunners.forEach(r => {
      if (r) {
        const raw = r.cat_name || r.cat;
        registerCat(raw, r.category_id, r.distance, r.unit, catColorMap?.[r.cat] || catColorMap?.[r.cat_name]);
      }
    });

    return Array.from(catMap.values());
  }, [existingCategories, fallbackCategories, dbRunners, catColorMap]);

  // Extract unique age groups and ages from DB runners
  const dbAgeGroups = useMemo(() => {
    const ageSet = new Set();
    dbRunners.forEach(r => {
      if (r.age_group && r.age_group !== 'N/A' && r.age_group !== '-') ageSet.add(r.age_group);
      if (r.age && r.age !== 'N/A' && r.age !== '-') ageSet.add(r.age);
    });
    return Array.from(ageSet).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );
  }, [dbRunners]);

  // Extract unique nationalities from DB runners
  const dbNationalities = useMemo(() => {
    const natSet = new Set(['THAI']);
    dbRunners.forEach(r => {
      if (r.nat && r.nat.trim()) natSet.add(r.nat.trim().toUpperCase());
    });
    ['JPN', 'CHN', 'USA', 'GBR', 'FRA', 'GER', 'AUS', 'SGP', 'MYS'].forEach(n => natSet.add(n));
    return Array.from(natSet).sort();
  }, [dbRunners]);

  // Extract unique genders from DB runners (strictly English only: Male / Female)
  const dbGenders = useMemo(() => {
    const genderSet = new Set(['Male', 'Female']);
    dbRunners.forEach(r => {
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
    return Array.from(genderSet);
  }, [dbRunners]);

  // Fallback single-fetch: only when opened standalone with 0 runners and 0 categories passed
  useEffect(() => {
    if (!isOpen || fallbackFetchedRef.current) return;
    if (existingRunners.length > 0 || (existingCategories && existingCategories.length > 0)) return;
    if (!effectiveEventId) return;

    fallbackFetchedRef.current = true;
    setLoadingFallback(true);

    async function fetchFallback() {
      try {
        const { data: cData } = await supabase
          .from('categories')
          .select('id, name, color, distance_km, unit')
          .eq('event_id', effectiveEventId)
          .order('distance_km', { ascending: true });

        if (cData) setFallbackCategories(cData);

        const { data: rData } = await supabase
          .from('runners')
          .select('id, bib, name, cat, cat_name, gender, age, age_group, nat, category_id, distance, unit')
          .eq('event_id', effectiveEventId)
          .order('id', { ascending: true })
          .limit(500);

        if (rData) setFallbackRunners(rData);
      } catch (err) {
        console.warn('Fallback reference fetch warning:', err);
      } finally {
        setLoadingFallback(false);
      }
    }

    fetchFallback();
  }, [isOpen, existingRunners.length, existingCategories, effectiveEventId]);

  // Initialize runner form data ONLY when modal opens or active runner changes
  const runnerId = runner?.id;
  useEffect(() => {
    if (isOpen && runner) {
      // Normalize gender to English only (Male / Female)
      let g = (runner.gender || '').trim();
      if (g.toLowerCase() === 'male' || g === 'M' || g === 'ชาย' || g === 'ชาย (Male)') {
        g = 'Male';
      } else if (g.toLowerCase() === 'female' || g === 'F' || g === 'หญิง' || g === 'หญิง (Female)') {
        g = 'Female';
      } else if (!g) {
        g = 'Male';
      }

      const curAge = (runner.age_group || runner.age || '').trim();
      const curNat = (runner.nat || 'THAI').trim().toUpperCase();

      // Extract clean cat_name and distance
      let cleanCatName = (runner.cat_name || '').trim();
      let catStr = (runner.cat || '').trim();
      let dist = runner.distance != null && !isNaN(Number(runner.distance)) ? Number(runner.distance) : null;
      let u = (runner.unit || 'KM').toUpperCase();
      if (u === 'K') u = 'KM';

      if (!cleanCatName && catStr) {
        const m = catStr.match(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$/);
        if (m) {
          if (dist == null) dist = parseFloat(m[1]);
          if (!u || u === 'KM') u = m[2].toUpperCase();
          cleanCatName = m[3].trim();
        } else {
          cleanCatName = catStr.replace(/\s*\([\d.]+\s*[a-zA-Z]*\)/g, '').trim();
        }
      }

      let formattedCat = catStr;
      if (cleanCatName && dist != null && !isNaN(dist)) {
        formattedCat = `${dist} ${u} : ${cleanCatName}`;
      } else if (!formattedCat) {
        formattedCat = cleanCatName;
      }

      setFormData({
        bib: runner.bib || '',
        name: runner.name || '',
        cat: formattedCat,
        cat_name: cleanCatName,
        category_id: runner.category_id || '',
        distance: dist,
        unit: u,
        gender: g,
        age: curAge,
        nat: curNat || 'THAI',
        registration_status: runner.registration_status || 'PRE_REGISTERED'
      });

      setIsCustomAge(false);
      setCustomAge('');
      setIsCustomNat(false);
      setCustomNat('');
    }
    // Intentionally re-runs only when the modal opens for a given runner (isOpen, runnerId) —
    // this is a one-shot form reset from the runner's snapshot at open time, not a live sync.
    // Adding the individual runner.* fields would re-run this on every RaceContext update while
    // the modal is open, silently discarding whatever the operator has typed so far.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, runnerId]);

  // Check duplicate BIB in real-time (excluding the current runner)
  const duplicateRunner = useMemo(() => {
    if (!formData.bib || !dbRunners.length || !runner) return null;
    const cleanBib = String(formData.bib).trim().toLowerCase();
    return dbRunners.find(
      r => r.id !== runner.id && String(r.bib || '').trim().toLowerCase() === cleanBib
    ) || null;
  }, [formData.bib, dbRunners, runner]);

  const handleCategorySelect = (e) => {
    const selectedName = e.target.value;
    const catObj = dbCategories.find(c => c.name === selectedName);

    let dist = null;
    let u = (catObj?.unit || '').trim().toUpperCase();
    if (!u || u === 'K' || u === 'KM') {
      u = 'KM';
    }

    let cleanCatName = selectedName;
    if (catObj?.distance_km != null && !isNaN(Number(catObj.distance_km))) {
      dist = Number(catObj.distance_km);
    } else if (selectedName) {
      const match = selectedName.match(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$/);
      if (match) {
        dist = parseFloat(match[1]);
        if (match[2]) u = match[2].toUpperCase();
        cleanCatName = match[3].trim();
      } else {
        const numMatch = selectedName.match(/([\d.]+)\s*([a-zA-Z]*)/);
        if (numMatch && numMatch[1]) {
          dist = parseFloat(numMatch[1]);
          if (numMatch[2]) u = numMatch[2].toUpperCase();
        }
        cleanCatName = selectedName.replace(/\s*\([\d.]+\s*[a-zA-Z]*\)/g, '').trim();
      }
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
      setCustomAge(formData.age || '');
    } else {
      setIsCustomAge(false);
      setFormData(prev => ({ ...prev, age: val }));
    }
  };

  const handleNatSelect = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomNat(true);
      setCustomNat(formData.nat || '');
    } else {
      setIsCustomNat(false);
      setFormData(prev => ({ ...prev, nat: val }));
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!runner?.id) {
      alert('ไม่พบรหัสนักวิ่ง (Runner ID missing)');
      return;
    }

    if (duplicateRunner) {
      alert(`หมายเลข BIB ${formData.bib} ซ้ำกับนักวิ่งคนอื่นในระบบ (${duplicateRunner.name})`);
      return;
    }

    setIsSaving(true);
    try {
      const finalAge = isCustomAge ? customAge.trim() : formData.age.trim();
      const finalNat = isCustomNat ? customNat.trim() : formData.nat.trim();

      // Ensure gender is saved in English only (Male / Female)
      let finalGender = (formData.gender || '').trim();
      if (finalGender === 'M' || finalGender.toLowerCase() === 'male' || finalGender === 'ชาย' || finalGender === 'ชาย (Male)') {
        finalGender = 'Male';
      } else if (finalGender === 'F' || finalGender.toLowerCase() === 'female' || finalGender === 'หญิง' || finalGender === 'หญิง (Female)') {
        finalGender = 'Female';
      } else if (!finalGender) {
        finalGender = 'Male';
      }

      const cleanCatId = formData.category_id && String(formData.category_id).trim() ? String(formData.category_id).trim() : null;

      // Format cat and cat_name:
      // cat: "[distance] KM : [cat_name]" (e.g. "5 KM : Soft Rock")
      // cat_name: "[cat_name]" (e.g. "Soft Rock")
      let catName = (formData.cat_name || formData.cat || '').trim();
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

      const updatePayload = {
        bib: String(formData.bib).trim(),
        name: String(formData.name).trim(),
        cat: formattedCat,
        cat_name: catName,
        ...(cleanCatId ? { category_id: cleanCatId } : {}),
        distance: dist,
        unit: u,
        gender: finalGender,
        age: finalAge || 'N/A',
        age_group: finalAge || 'N/A',
        nat: finalNat || 'THAI',
        registration_status: formData.registration_status,
        ...(formData.registration_status === 'PRE_REGISTERED' ? { checked_in_at: null, checked_in_by: null } : {})
      };

      const { data: updateData, error: updateError } = await supabase
        .from('runners')
        .update(updatePayload)
        .eq('id', runner.id)
        .select('id');

      if (updateError) {
        throw updateError;
      }

      assertWriteOk({ data: updateData, error: updateError });

      onSave({
        ...runner,
        ...updatePayload,
        checkin: formData.registration_status === 'PRE_REGISTERED' ? null : runner.checkin
      });
      onClose();
    } catch (err) {
      console.error('Update runner error:', err);
      let msg = err?.message || 'บันทึกข้อมูลไม่สำเร็จ';
      if (err?.name === 'TypeError' && String(err?.message || '').toLowerCase().includes('fetch')) {
        msg = 'ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้ (Network/Fetch Error) กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต หรือรีเฟรชหน้าเว็บและเข้าสู่ระบบด้วย PIN ใหม่อีกครั้ง';
      }
      alert(`บันทึกไม่สำเร็จ: ${msg}`);
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
        width: '560px',
        maxWidth: '92%',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink)' }}>
            ✏️ แก้ไขข้อมูลนักวิ่ง
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              cursor: 'pointer',
              color: 'var(--ink-2)'
            }}
          >
            ✕
          </button>
        </div>

        {/* DB Reference Status Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '4px 12px',
          background: 'var(--bg-soft)',
          borderRadius: '20px',
          fontSize: '0.78rem',
          color: 'var(--ink-2)',
          marginBottom: '16px',
          border: '1px solid var(--border)'
        }}>
          <span>📌 ระยะในระบบ: <b>{loadingFallback ? '...' : dbCategories.length}</b> รุ่น</span>
          <span>•</span>
          <span>🎂 กลุ่มอายุ: <b>{loadingFallback ? '...' : dbAgeGroups.length}</b> กลุ่ม</span>
          <span>•</span>
          <span>👥 นักวิ่ง: <b>{loadingFallback ? '...' : dbRunners.length}</b> คน</span>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* 1. Category */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
              1. หมวดหมู่ / ระยะทาง (Category) <span style={{ color: 'var(--warn)' }}>*</span>
            </label>
            <select
              className="search"
              name="cat"
              value={formData.cat_name || (formData.cat ? formData.cat.replace(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*/, '').trim() : '')}
              onChange={handleCategorySelect}
              required
              style={{ width: '100%', padding: '10px 12px', fontSize: '0.92rem', fontWeight: 600 }}
            >
              <option value="">-- คลิกเลือกหมวดหมู่จากฐานข้อมูล ({dbCategories.length} รายการ) --</option>
              {formData.cat_name && !dbCategories.some(c => c.name === formData.cat_name) && (
                <option value={formData.cat_name}>{formData.cat || formData.cat_name} (ข้อมูลเดิม)</option>
              )}
              {dbCategories.map(c => (
                <option
                  key={c.name}
                  value={c.name}
                  style={{ backgroundColor: c.color || catColorMap[c.name] || '#3b82f6', color: '#fff' }}
                >
                  {c.distance_km ? `${c.distance_km} ${c.unit || 'KM'} : ` : ''}{c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. BIB with duplicate check */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
              2. หมายเลข BIB <span style={{ color: 'var(--warn)' }}>*</span>
            </label>
            <input
              className="search"
              type="text"
              name="bib"
              value={formData.bib}
              onChange={handleChange}
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
                gap: '6px',
                marginTop: '4px'
              }}>
                ⚠️ หมายเลข BIB {formData.bib} ซ้ำกับนักวิ่งคนอื่นในระบบ: {duplicateRunner.name} ({duplicateRunner.cat || 'ไม่ระบุรุ่น'})
              </div>
            )}
          </div>
          
          {/* 3. Name & Quick Title buttons */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>
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
                      cursor: 'pointer',
                      color: 'var(--ink)'
                    }}
                  >
                    +{t}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="search"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="กรอกชื่อ นามสกุล"
              style={{ width: '100%', padding: '10px 12px' }}
            />
          </div>

          {/* 4. Gender & Age Group */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
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
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
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
                {formData.age && !dbAgeGroups.includes(formData.age) && (
                  <option value={formData.age}>{formData.age} (ข้อมูลเดิม)</option>
                )}
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
          
          {/* 5. Nationality & Registration Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
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
                {formData.nat && formData.nat !== 'THAI' && !dbNationalities.includes(formData.nat) && (
                  <option value={formData.nat}>{formData.nat} (ข้อมูลเดิม)</option>
                )}
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
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
                7. สถานะการสมัคร
              </label>
              <select
                className="search"
                name="registration_status"
                value={formData.registration_status}
                onChange={handleChange}
                style={{ width: '100%', padding: '10px 12px' }}
              >
                <option value="PRE_REGISTERED">PRE_REGISTERED (สมัครแล้ว/รอยืนยัน)</option>
                <option value="CHECKED_IN">CHECKED_IN (เช็คอินแล้ว)</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
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
              disabled={isSaving || !!duplicateRunner}
            >
              {isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
