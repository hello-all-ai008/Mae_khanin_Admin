import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, 
  Printer, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  User, 
  Trophy, 
  Medal, 
  Users, 
  RefreshCw, 
  Sparkles,
  Zap,
  ArrowRight
} from 'lucide-react';
import { useRace } from '../context/RaceContext';
import { smartFindRunner, normalizeScannedBib, extractBibCandidates } from '../lib/bibUtils';
import ESlip, { computeRunnerRanks, formatEnglishLabel } from '../components/ESlip';
import ESlipModal from '../components/ESlipModal';
import { supabase } from '../lib/supabaseClient';

export default function PrintESlip() {
  const { 
    runners = [], 
    categories = [], 
    checkpoints = [], 
    events = [], 
    selectedEventId, 
    setSelectedEventId, 
    addToast 
  } = useRace();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRunner, setSelectedRunner] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [autoPrintTrigger, setAutoPrintTrigger] = useState(false);

  // Auto-print preference saved in localStorage
  const [autoPrint, setAutoPrint] = useState(() => {
    return localStorage.getItem('rohn_auto_print_eslip') === 'true';
  });

  const [recentRunners, setRecentRunners] = useState([]);
  const searchInputRef = useRef(null);

  // Focus search input on mount and whenever modal closes
  useEffect(() => {
    if (!isModalOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isModalOpen]);

  // Persist autoPrint setting
  const toggleAutoPrint = (checked) => {
    setAutoPrint(checked);
    localStorage.setItem('rohn_auto_print_eslip', String(checked));
    if (addToast) {
      addToast(checked 
        ? '✓ เปิดโหมดพิมพ์อัตโนมัติ (Auto Print ON)' 
        : 'ปิดโหมดพิมพ์อัตโนมัติ (Manual Print)'
      );
    }
  };

  // Live matching candidates when typing
  const liveMatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    
    return runners.filter(r => {
      if (!r || r.bib === 'RUNNER_CONFIG' || String(r.bib || '').startsWith('__')) return false;
      const b = String(r.bib || '').toLowerCase();
      const n = String(r.name || '').toLowerCase();
      const rf = String(r.rfid_tag || '').toLowerCase();
      return b.includes(q) || n.includes(q) || rf.includes(q);
    }).slice(0, 6);
  }, [searchTerm, runners]);

  // Default sample runner preview when no runner has been selected yet
  const sampleRunner = useMemo(() => {
    const firstFinisher = runners.find(r => r && (r.finish || r.cps?.finish) && r.bib !== 'RUNNER_CONFIG' && !String(r.bib || '').startsWith('__'));
    if (firstFinisher) {
      return {
        ...firstFinisher,
        isSamplePreview: true
      };
    }
    return {
      bib: '1001',
      name: 'สมชาย ใจดี (Sample Runner)',
      gender: 'ชาย (Male)',
      age_group: '30-39 ปี (30–39 years)',
      distance: '25 KM',
      cat: '25 KM',
      cat_name: '25 KM : Half Trail',
      checkin: Date.now() - 14400000,
      gun_start_time: Date.now() - 12600000,
      start_date: Date.now() - 12600000,
      finish: Date.now() - 1800000,
      cps: {
        start: Date.now() - 12600000,
        a1: Date.now() - 9000000,
        a2: Date.now() - 5400000,
        finish: Date.now() - 1800000
      },
      race_status: 'FINISHER',
      isSamplePreview: true
    };
  }, [runners]);

  const activeDisplayRunner = selectedRunner || sampleRunner;
  const isViewingSample = !selectedRunner;

  // Compute ranks for the currently displayed runner
  const ranks = useMemo(() => {
    if (!activeDisplayRunner) return null;
    return computeRunnerRanks(activeDisplayRunner, runners);
  }, [activeDisplayRunner, runners]);

  // Select runner and handle auto-print if enabled
  const selectRunnerAndProcess = useCallback((runner, fromScan = false) => {
    if (!runner) return;
    setSelectedRunner(runner);
    setSearchTerm('');

    // Save to recent list (up to 5 items)
    setRecentRunners(prev => {
      const filtered = prev.filter(r => r.bib !== runner.bib);
      return [runner, ...filtered].slice(0, 5);
    });

    const hasFinish = Boolean(runner.finish || runner.cps?.finish);

    if (autoPrint) {
      if (hasFinish) {
        if (addToast) {
          addToast(`🖨️ พบ BIB ${runner.bib} (${runner.name}) — สั่งพิมพ์อัตโนมัติ...`);
        }
        setAutoPrintTrigger(true);
        setIsModalOpen(true);
      } else {
        if (addToast) {
          addToast(`⚠️ BIB ${runner.bib} ยังไม่มีเวลาเข้าเส้นชัย ไม่สามารถพิมพ์สลิปได้`);
        }
      }
    } else {
      if (addToast && fromScan) {
        addToast(`✓ พบ BIB ${runner.bib} (${runner.name})`);
      }
    }
  }, [autoPrint, addToast]);

  // Handle search submission (Enter key or form submit)
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const query = searchTerm.trim();
    if (!query) return;

    const found = smartFindRunner(query, runners);
    if (found) {
      selectRunnerAndProcess(found, true);
    } else {
      if (addToast) {
        addToast(`❌ ไม่พบข้อมูลนักวิ่งสำหรับ "${query}"`);
      }
    }
  };

  // Open manual print modal
  const handleManualPrint = () => {
    if (!selectedRunner) return;
    if (!selectedRunner.finish && !selectedRunner.cps?.finish) {
      if (addToast) {
        addToast(`⚠️ นักวิ่งท่านนี้ยังไม่เข้าเส้นชัย ไม่สามารถพิมพ์ E-Slip ได้`);
      }
      return;
    }
    setAutoPrintTrigger(false);
    setIsModalOpen(true);
  };

  // Helper formatting
  const fmtTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : (isNaN(Number(ts)) ? ts : Number(ts)));
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const fmtDur = (ms) => {
    if (ms == null || isNaN(ms) || ms < 0) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Calculate Net Time for runner
  const netTimeMs = useMemo(() => {
    if (!selectedRunner) return null;
    const fin = selectedRunner.finish ? Number(selectedRunner.finish) : null;
    if (!fin) return null;
    const start = selectedRunner.gun_start_time 
      ? Number(selectedRunner.gun_start_time)
      : (selectedRunner.start_date ? Number(selectedRunner.start_date) : null);
    if (!start) return null;
    return Math.max(0, fin - start);
  }, [selectedRunner]);

  const genderLabel = selectedRunner?.gender 
    ? (String(selectedRunner.gender).toUpperCase() === 'M' || String(selectedRunner.gender).toLowerCase().includes('male') || String(selectedRunner.gender).includes('ชาย') ? 'ชาย (Male)' : 'หญิง (Female)')
    : '—';

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--start, #3b82f6)', fontWeight: 700 }}>SUMMARY & TIMING SLIP</span>
          <h1 style={{ margin: '4px 0 6px 0', fontSize: '26px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Printer size={28} color="var(--start, #3b82f6)" />
            พิมพ์ใบ E-Slip (Print E-Slip Station)
          </h1>
          <p style={{ margin: 0, color: 'var(--ink-2, #64748b)', fontSize: '14px' }}>
            จุดพิมพ์ใบเสร็จบันทึกเวลา E-Slip ค้นหาด้วย BIB หรือยิงสแกน Barcode พร้อมระบบพิมพ์อัตโนมัติ
          </p>
        </div>

        {/* Top Controls: Event Selector & Auto Print Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {events && events.length > 1 && (
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="select hide-mobile"
              style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          )}

          {/* Auto Print Checkbox Card */}
          <label 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '8px 16px', 
              background: autoPrint ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-soft, #f1f5f9)', 
              border: `1.5px solid ${autoPrint ? 'var(--finish, #10b981)' : 'var(--line, #cbd5e1)'}`,
              borderRadius: '10px',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <input 
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => toggleAutoPrint(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--finish, #10b981)' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: autoPrint ? '#047857' : 'var(--ink)' }}>
                {autoPrint ? '⚡ พิมพ์อัตโนมัติ (Auto Print ON)' : '🖨️ ยังไม่ต้องปริ้น Auto (Manual Print)'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--ink-2, #64748b)' }}>
                {autoPrint ? 'สั่งพิมพ์ทันทีที่ยิงสแกนพบนักวิ่ง' : 'กดปุ่มพิมพ์สลิปด้วยตนเอง'}
              </span>
            </div>
          </label>
        </div>
      </div>

      <style>{`
        .print-eslip-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 380px;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 960px) {
          .print-eslip-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Main Layout Grid */}
      <div className="print-eslip-grid">
        
        {/* Left Column: Search & Runner Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Search Box Card */}
          <div className="card" style={{ padding: '20px', borderRadius: 'var(--radius)', position: 'relative' }}>
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search 
                  size={20} 
                  color="var(--ink-2, #64748b)" 
                  style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} 
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาด้วย BIB, ชื่อนามสกุล, หรือยิงสแกน Barcode / QR..."
                  style={{
                    width: '100%',
                    padding: '14px 44px 14px 46px',
                    fontSize: '16px',
                    fontWeight: 600,
                    borderRadius: '12px',
                    border: '2px solid var(--line, #cbd5e1)',
                    background: 'var(--surface, #ffffff)',
                    color: 'var(--ink, #1e293b)',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--start, #3b82f6)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--line, #cbd5e1)'}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}
                    style={{
                      position: 'absolute',
                      right: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--ink-2, #64748b)',
                      padding: '4px'
                    }}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  padding: '0 24px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap'
                }}
              >
                <Search size={18} />
                ค้นหา
              </button>
            </form>

            {/* Live Dropdown Auto-Complete Matches */}
            {liveMatches.length > 0 && (
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '20px',
                  right: '20px',
                  marginTop: '6px',
                  background: 'var(--surface, #ffffff)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                  border: '1px solid var(--line, #cbd5e1)',
                  zIndex: 50,
                  overflow: 'hidden'
                }}
              >
                <div style={{ padding: '8px 14px', background: 'var(--bg-soft, #f8fafc)', fontSize: '11px', fontWeight: 700, color: 'var(--ink-2, #64748b)', textTransform: 'uppercase' }}>
                  ผลลัพธ์ที่ตรงกัน ({liveMatches.length})
                </div>
                {liveMatches.map(runner => (
                  <div
                    key={runner.bib}
                    onClick={() => selectRunnerAndProcess(runner, true)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--line, #e2e8f0)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-soft, #f1f5f9)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '16px', 
                        fontWeight: 800, 
                        background: 'var(--bg-soft, #f1f5f9)', 
                        padding: '4px 8px', 
                        borderRadius: '6px' 
                      }}>
                        {runner.bib}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--ink)' }}>{runner.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-2, #64748b)' }}>
                          {runner.gender || '—'} • {formatEnglishLabel(runner.age_group || runner.ageGroup || runner.age)} • {runner.cat || runner.distance}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {runner.finish ? (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--finish, #10b981)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={14} /> FINISHED
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2, #64748b)' }}>
                          ยังไม่เข้าเส้นชัย
                        </span>
                      )}
                      <ArrowRight size={16} color="var(--ink-2, #64748b)" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Runner Pills */}
            {recentRunners.length > 0 && !selectedRunner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--ink-2, #64748b)', fontWeight: 600 }}>ค้นหาล่าสุด:</span>
                {recentRunners.map(r => (
                  <button
                    key={r.bib}
                    type="button"
                    onClick={() => selectRunnerAndProcess(r)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-soft, #f1f5f9)',
                      border: '1px solid var(--line, #e2e8f0)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>BIB {r.bib}</span>
                    <span style={{ color: 'var(--ink-2, #64748b)' }}>({r.name?.split(' ')[0]})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Runner Information Details Card */}
          {selectedRunner ? (
            <div className="card" style={{ padding: '24px', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Top Banner: BIB & Name */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--line, #e2e8f0)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    background: 'var(--start, #3b82f6)', 
                    color: '#ffffff', 
                    padding: '10px 18px', 
                    borderRadius: '12px', 
                    fontFamily: 'monospace', 
                    fontSize: '28px', 
                    fontWeight: 900,
                    letterSpacing: '1px',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                  }}>
                    {selectedRunner.bib || '—'}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--ink)' }}>
                      {selectedRunner.name || 'ไม่ระบุชื่อ'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-2, #64748b)' }}>
                        เพศ: <b style={{ color: 'var(--ink)' }}>{genderLabel}</b>
                      </span>
                      <span>•</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-2, #64748b)' }}>
                        รุ่นอายุ: <b style={{ color: 'var(--ink)' }}>{formatEnglishLabel(selectedRunner.age_group || selectedRunner.ageGroup || selectedRunner.age)}</b>
                      </span>
                      <span>•</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-2, #64748b)' }}>
                        ระยะ: <b style={{ color: 'var(--ink)' }}>{selectedRunner.cat || selectedRunner.distance || '—'}</b>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div>
                  {selectedRunner.finish ? (
                    <div style={{ 
                      padding: '6px 14px', 
                      borderRadius: '8px', 
                      background: 'rgba(16, 185, 129, 0.12)', 
                      color: '#059669', 
                      border: '1.5px solid rgba(16, 185, 129, 0.3)',
                      fontWeight: 800,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <CheckCircle2 size={16} /> เข้าเส้นชัยแล้ว (FINISHED)
                    </div>
                  ) : selectedRunner.race_status === 'DNF' ? (
                    <div style={{ 
                      padding: '6px 14px', 
                      borderRadius: '8px', 
                      background: 'rgba(239, 68, 68, 0.12)', 
                      color: '#dc2626', 
                      border: '1.5px solid rgba(239, 68, 68, 0.3)',
                      fontWeight: 800,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <AlertCircle size={16} /> DNF (Did Not Finish)
                    </div>
                  ) : (
                    <div style={{ 
                      padding: '6px 14px', 
                      borderRadius: '8px', 
                      background: 'rgba(59, 130, 246, 0.12)', 
                      color: '#2563eb', 
                      border: '1.5px solid rgba(59, 130, 246, 0.3)',
                      fontWeight: 700,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Clock size={16} /> กำลังแข่งขัน (IN RACE)
                    </div>
                  )}
                </div>
              </div>

              {/* THREE SPECIFIED RANKS (OVERALL, AGE GROUP, GENDER OVERALL) */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-2, #64748b)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  สรุปผลอันดับการแข่งขัน (Official Rankings)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  
                  {/* 1. Overall Rank */}
                  <div style={{ 
                    padding: '16px', 
                    borderRadius: '12px', 
                    background: 'var(--bg-soft, #f8fafc)', 
                    border: '1px solid var(--line, #e2e8f0)',
                    textAlign: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--ink-2, #64748b)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                      <Trophy size={15} color="var(--start, #3b82f6)" />
                      Overall Rank (อันดับรวม)
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink, #1e293b)', margin: '8px 0 4px', whiteSpace: 'nowrap' }}>
                      {ranks?.overallDisplay || '—'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-2, #64748b)' }}>
                      นักวิ่งทั้งหมดในระยะ {selectedRunner.cat || selectedRunner.distance}
                    </div>
                  </div>

                  {/* 2. Age Group Rank */}
                  <div style={{ 
                    padding: '16px', 
                    borderRadius: '12px', 
                    background: 'var(--bg-soft, #f8fafc)', 
                    border: '1px solid var(--line, #e2e8f0)',
                    textAlign: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--ink-2, #64748b)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                      <Medal size={15} color="#8b5cf6" />
                      Age Group (อันดับกลุ่มอายุ)
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#7c3aed', margin: '8px 0 4px', whiteSpace: 'nowrap' }}>
                      {ranks?.catDisplay || '—'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-2, #64748b)' }}>
                      รุ่น {formatEnglishLabel(selectedRunner.age_group || selectedRunner.ageGroup || selectedRunner.age)}
                    </div>
                  </div>

                  {/* 3. Gender Overall Rank */}
                  <div style={{ 
                    padding: '16px', 
                    borderRadius: '12px', 
                    background: 'var(--bg-soft, #f8fafc)', 
                    border: '1px solid var(--line, #e2e8f0)',
                    textAlign: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--ink-2, #64748b)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                      <Users size={15} color="#059669" />
                      Gender Overall (อันดับเฉพาะเพศ)
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', margin: '8px 0 4px', whiteSpace: 'nowrap' }}>
                      {ranks?.genderDisplay || '—'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-2, #64748b)' }}>
                      เฉพาะเพศ {genderLabel} ในระยะนี้
                    </div>
                  </div>

                </div>
              </div>

              {/* Timing Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', padding: '16px', background: 'var(--bg-soft, #f8fafc)', borderRadius: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-2, #64748b)', textTransform: 'uppercase', fontWeight: 700 }}>Check-in</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{fmtTime(selectedRunner.checkin || selectedRunner.checked_in_at)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-2, #64748b)', textTransform: 'uppercase', fontWeight: 700 }}>Start (Gun Time)</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>{fmtTime(selectedRunner.gun_start_time || selectedRunner.start_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-2, #64748b)', textTransform: 'uppercase', fontWeight: 700 }}>Finish Time</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: selectedRunner.finish ? 'var(--finish, #10b981)' : 'var(--ink)' }}>
                    {fmtTime(selectedRunner.finish)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-2, #64748b)', textTransform: 'uppercase', fontWeight: 700 }}>Net Time (Start-Finish)</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--start, #3b82f6)' }}>
                    {fmtDur(netTimeMs)}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleManualPrint}
                  disabled={!selectedRunner.finish && !selectedRunner.cps?.finish}
                  style={{
                    flex: '1 1 200px',
                    padding: '14px 24px',
                    borderRadius: '12px',
                    background: (selectedRunner.finish || selectedRunner.cps?.finish) ? 'var(--start, #3b82f6)' : '#94a3b8',
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: (selectedRunner.finish || selectedRunner.cps?.finish) ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: (selectedRunner.finish || selectedRunner.cps?.finish) ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Printer size={20} />
                  พิมพ์ใบ E-Slip (Print Slip)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRunner(null);
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                  }}
                  style={{
                    padding: '14px 20px',
                    borderRadius: '12px',
                    background: 'var(--bg-soft, #f1f5f9)',
                    color: 'var(--ink, #1e293b)',
                    fontSize: '14px',
                    fontWeight: 600,
                    border: '1px solid var(--line, #cbd5e1)',
                    cursor: 'pointer'
                  }}
                >
                  ล้างข้อมูล / ค้นหาคนต่อไป
                </button>
              </div>

              {!selectedRunner.finish && !selectedRunner.cps?.finish && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#b45309', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={18} />
                  <span>นักวิ่งท่านนี้ยังไม่มีข้อมูลเวลาเข้าเส้นชัย (Finish Time) จึงไม่สามารถพิมพ์ใบเสร็จ E-Slip ได้</span>
                </div>
              )}

            </div>
          ) : (
            /* Empty State Prompt */
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: 'var(--radius)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--start, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Printer size={32} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
                พร้อมพิมพ์ใบเสร็จ E-Slip
              </h3>
              <p style={{ margin: 0, color: 'var(--ink-2, #64748b)', fontSize: '14px', maxWidth: '440px', marginInline: 'auto', lineHeight: 1.6 }}>
                กรุณายิงสแกน Barcode / QR Code จากป้ายบิบ หรือพิมพ์หมายเลข BIB ในช่องค้นหาด้านบน เพื่อดึงข้อมูลและพิมพ์ใบเสร็จ
              </p>
            </div>
          )}

        </div>

        {/* Right Column: Live E-Slip Thermal Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-2, #64748b)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={15} color="var(--start, #3b82f6)" />
                ตัวอย่างสลิปความร้อน (Preview 80mm)
              </span>
              {isViewingSample && (
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  padding: '2px 8px', 
                  borderRadius: '6px', 
                  background: 'rgba(59, 130, 246, 0.12)', 
                  color: 'var(--start, #3b82f6)',
                  border: '1px solid rgba(59, 130, 246, 0.25)' 
                }}>
                  ตัวอย่าง (SAMPLE)
                </span>
              )}
            </div>

            {selectedRunner ? (
              <button
                type="button"
                onClick={handleManualPrint}
                disabled={!selectedRunner.finish && !selectedRunner.cps?.finish}
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  background: (selectedRunner.finish || selectedRunner.cps?.finish) ? 'var(--start, #3b82f6)' : '#94a3b8',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: (selectedRunner.finish || selectedRunner.cps?.finish) ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Printer size={14} /> พิมพ์ทันที
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedRunner(sampleRunner);
                  if (addToast) addToast('โหลดข้อมูลนักวิ่งตัวอย่างแล้ว กดพิมพ์เพื่อทดสอบเครื่องพิมพ์ได้');
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'var(--bg-soft, #f1f5f9)',
                  color: 'var(--ink-2, #64748b)',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid var(--line, #cbd5e1)',
                  cursor: 'pointer'
                }}
              >
                ทดสอบพิมพ์ตัวอย่าง
              </button>
            )}
          </div>

          {/* Receipt Preview Box */}
          <div 
            style={{
              background: '#ffffff',
              border: '1px solid var(--line, #cbd5e1)',
              borderRadius: '12px',
              padding: '12px 10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
              display: 'flex',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <ESlip 
              runner={activeDisplayRunner}
              overallRank={ranks?.overallRank}
              catRank={ranks?.catRank}
              stations={checkpoints}
              runners={runners}
              categories={categories}
            />
          </div>

          {isViewingSample && (
            <div style={{ textAlign: 'center', fontSize: '11.5px', color: 'var(--ink-2, #64748b)', padding: '0 4px', lineHeight: 1.4 }}>
              💡 ค้นหาหมายเลข BIB หรือยิงสแกน Barcode เพื่อเปลี่ยนสลิปตัวอย่างเป็นข้อมูลจริงของนักวิ่งทันที
            </div>
          )}
        </div>

      </div>

      {/* Print Modal for Physical Thermal Output */}
      {isModalOpen && selectedRunner && (
        <ESlipModal
          runner={selectedRunner}
          overallRank={ranks?.overallRank}
          catRank={ranks?.catRank}
          stations={checkpoints}
          runners={runners}
          categories={categories}
          autoPrint={autoPrintTrigger}
          onClose={() => {
            setIsModalOpen(false);
            setAutoPrintTrigger(false);
            searchInputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
