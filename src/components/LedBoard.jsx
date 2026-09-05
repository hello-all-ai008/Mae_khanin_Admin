import React, { useState, useMemo } from 'react';
import { useRace } from '../context/RaceContext';
import { Trophy } from 'lucide-react';

function isMale(gender) {
  if (!gender) return false;
  const g = String(gender).trim().toLowerCase();
  return g === 'm' || g === 'male' || g.startsWith('ชาย') || g === 'man';
}

function isFemale(gender) {
  if (!gender) return false;
  const g = String(gender).trim().toLowerCase();
  return g === 'f' || g === 'female' || g.startsWith('หญิง') || g === 'woman';
}

function parseFinishTime(r) {
  if (!r || !r.finish) return null;
  const t = typeof r.finish === 'number' ? r.finish : new Date(r.finish).getTime();
  return isNaN(t) ? null : t;
}

function formatRunnerTime(runner) {
  if (!runner) return '—';
  const finishTime = parseFinishTime(runner);
  if (!finishTime) return '—';

  // If checkin/start time is available, calculate total duration
  const startTime = runner.checkin ? (typeof runner.checkin === 'number' ? runner.checkin : new Date(runner.checkin).getTime()) : null;
  if (startTime && finishTime > startTime) {
    const durMs = finishTime - startTime;
    const totalSec = Math.floor(durMs / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // Fallback: Clock time of day (HH:mm:ss)
  const d = new Date(finishTime);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return '—';
}

export default function LedBoard({ runner, message, warn = false, runners: propsRunners, categories: propsCategories }) {
  let contextRace = {};
  try {
    contextRace = useRace() || {};
  } catch {
    contextRace = {};
  }

  const allRunners = propsRunners || contextRace.runners || [];
  const allCategories = propsCategories || contextRace.categories || [];

  const [selectedCat, setSelectedCat] = useState('ALL');

  // Extract all unique distances/categories
  const categoriesList = useMemo(() => {
    const set = new Set();
    if (Array.isArray(allCategories)) {
      allCategories.forEach(c => {
        const name = typeof c === 'string' ? c : (c.name || c.code);
        if (name) set.add(name);
      });
    }
    allRunners.forEach(r => {
      const c = r.cat || r.category || r.distance;
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [allCategories, allRunners]);

  // Compute 1st Male and 1st Female for each category (ignoring age)
  const overallLeaders = useMemo(() => {
    if (!categoriesList.length) return [];

    return categoriesList.map(catName => {
      const catObj = Array.isArray(allCategories)
        ? allCategories.find(c => (typeof c === 'string' ? c : (c.name || c.code)) === catName)
        : null;
      const color = (catObj && catObj.color) || '#3b82f6';

      const catRunners = allRunners.filter(r => {
        const c = r.cat || r.category || r.distance;
        return c === catName && parseFinishTime(r);
      });

      // Earliest finish = 1st person across finish line
      const males = catRunners
        .filter(r => isMale(r.gender))
        .sort((a, b) => parseFinishTime(a) - parseFinishTime(b));

      const females = catRunners
        .filter(r => isFemale(r.gender))
        .sort((a, b) => parseFinishTime(a) - parseFinishTime(b));

      return {
        category: catName,
        color,
        male: males[0] || null,
        female: females[0] || null
      };
    });
  }, [categoriesList, allRunners, allCategories]);

  const filteredLeaders = useMemo(() => {
    if (selectedCat === 'ALL') return overallLeaders;
    return overallLeaders.filter(item => item.category === selectedCat);
  }, [overallLeaders, selectedCat]);

  return (
    <div>
      {/* LED Display Box */}
      <div className={`led ${warn ? 'flash-warn' : (runner ? 'flash-ok' : '')}`}>
        {runner ? (
          <>
            <div className="bib">{runner.bib}</div>
            <div className="name">{runner.name ? runner.name.toUpperCase() : ''}</div>
            <div className="meta">{runner.nat || ''} · {runner.age || ''} · {runner.cat || ''}</div>
            {message && <div className={`time ${warn ? 'meta-warn' : ''}`}>{message}</div>}
          </>
        ) : (
          <div className="idle">— รอการสแกน —</div>
        )}
      </div>
      <div className="led-caption">แสดงผลบน Monitor / Tablet / Mobile</div>

      {/* 🏆 ตารางผู้นำ Overall (ชาย 1 / หญิง 1 แต่ละระยะ) */}
      <div 
        className="card" 
        style={{ 
          marginTop: '16px', 
          padding: '14px', 
          borderRadius: '12px', 
          border: '1px solid var(--line)', 
          background: '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
            <Trophy size={16} color="#eab308" />
            <span>ผู้นำ Overall (อันดับ 1 ชาย / หญิง)</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--ink-2)', background: 'var(--bg-soft)', padding: '2px 8px', borderRadius: '99px', fontWeight: 500 }}>
            ไม่สนอายุ
          </span>
        </div>

        {/* Distance Tabs if > 1 distance */}
        {categoriesList.length > 1 && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={() => setSelectedCat('ALL')}
              style={{
                border: '1px solid',
                borderColor: selectedCat === 'ALL' ? 'var(--ink)' : 'var(--line)',
                background: selectedCat === 'ALL' ? 'var(--ink)' : 'var(--bg-soft)',
                color: selectedCat === 'ALL' ? '#fff' : 'var(--ink-2)',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ทั้งหมด
            </button>
            {categoriesList.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCat(cat)}
                style={{
                  border: '1px solid',
                  borderColor: selectedCat === cat ? 'var(--ink)' : 'var(--line)',
                  background: selectedCat === cat ? 'var(--ink)' : 'var(--bg-soft)',
                  color: selectedCat === cat ? '#fff' : 'var(--ink-2)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-soft)', color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600, width: '60px' }}>ระยะ</th>
                <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '42px' }}>เพศ</th>
                <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '45px' }}>BIB</th>
                <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600 }}>ชื่อนักวิ่ง (ที่ 1)</th>
                <th style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 600, width: '65px' }}>เวลา</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaders.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '16px', textAlign: 'center', color: 'var(--ink-2)' }}>
                    ยังไม่มีข้อมูลระยะทางหรือผู้เข้าเส้นชัย
                  </td>
                </tr>
              ) : (
                filteredLeaders.map(item => (
                  <React.Fragment key={item.category}>
                    {/* Male Row */}
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 6px' }}>
                        <span 
                          style={{ 
                            display: 'inline-block',
                            background: item.color || '#3b82f6', 
                            color: '#fff', 
                            padding: '1px 6px', 
                            borderRadius: '4px', 
                            fontWeight: 700, 
                            fontSize: '10px' 
                          }}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <span style={{ color: '#0284c7', fontWeight: 700, fontSize: '11px' }}>ชาย</span>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {item.male ? item.male.bib : <span style={{ color: 'var(--ink-2)', opacity: 0.5 }}>-</span>}
                      </td>
                      <td style={{ padding: '6px 6px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.male ? (
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }} title={item.male.name}>
                            🥇 {item.male.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-2)', fontStyle: 'italic', fontSize: '11px' }}>— รอผล —</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: item.male ? 'var(--finish, #2434ad)' : 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                        {item.male ? formatRunnerTime(item.male) : '—'}
                      </td>
                    </tr>

                    {/* Female Row */}
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 6px' }}>
                        <span 
                          style={{ 
                            display: 'inline-block',
                            background: item.color || '#3b82f6', 
                            color: '#fff', 
                            padding: '1px 6px', 
                            borderRadius: '4px', 
                            fontWeight: 700, 
                            fontSize: '10px' 
                          }}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <span style={{ color: '#db2777', fontWeight: 700, fontSize: '11px' }}>หญิง</span>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {item.female ? item.female.bib : <span style={{ color: 'var(--ink-2)', opacity: 0.5 }}>-</span>}
                      </td>
                      <td style={{ padding: '6px 6px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.female ? (
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }} title={item.female.name}>
                            🥇 {item.female.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-2)', fontStyle: 'italic', fontSize: '11px' }}>— รอผล —</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: item.female ? 'var(--finish, #2434ad)' : 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                        {item.female ? formatRunnerTime(item.female) : '—'}
                      </td>
                    </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
