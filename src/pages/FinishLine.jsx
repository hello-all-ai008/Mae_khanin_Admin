import { useState, useMemo } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  WifiOff, 
  Trash2, 
  Settings, 
  ChevronDown, 
  ChevronUp, 
  Trophy, 
  Flag,
  AlertTriangle
} from 'lucide-react';
import { useRace } from '../context/RaceContext';
import LedBoard from '../components/LedBoard';
import ScannerInput from '../components/ScannerInput';
import ScanSyncBadge from '../components/ScanSyncBadge';
import StationSetupModal from '../components/StationSetupModal';
import MobileScanResultCard from '../components/MobileScanResultCard';

const safeFormatTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toTimeString().slice(0, 8);
};

export default function FinishLine() {
  const { 
    events, 
    selectedEventId, 
    setSelectedEventId, 
    runners, 
    loadingRunners, 
    categories,
    processScan, 
    scanLog,
    clearStationScanLog,
    showConfirm,
    pendingSyncQueue,
    isOnline
  } = useRace();
  
  const [ledState, setLedState] = useState({ runner: null, message: '', warn: false });
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  // Database-backed Finish Line stats according to DatabaseFlow.jsx
  const stats = useMemo(() => {
    const cleanRunners = (runners || []).filter(r => r.bib !== 'RUNNER_CONFIG' && !String(r.bib || '').startsWith('__'));
    const total = cleanRunners.length;
    
    // DNS = Did Not Start, DNF = Did Not Finish
    const dnsCount = cleanRunners.filter(r => r.race_status === 'DNS').length;
    const dnfCount = cleanRunners.filter(r => r.race_status === 'DNF').length;
    
    // Finished: runners who crossed the finish line and are not marked DNF/DNS
    const finished = cleanRunners.filter(r => 
      (r.finish != null || r.finish_time != null || r.race_status === 'FINISHED') &&
      r.race_status !== 'DNF' && 
      r.race_status !== 'DNS'
    ).length;

    // Active runners who started the race
    const started = Math.max(0, total - dnsCount);
    // In-Race / Remaining to finish: started minus finished and DNF
    const remaining = Math.max(0, started - finished - dnfCount);
    const percent = started > 0 ? Math.round((finished / started) * 100) : 0;

    return { total, started, finished, remaining, dnfCount, dnsCount, percent };
  }, [runners]);

  const activeEventName = useMemo(() => {
    const ev = (events || []).find(e => e.id === selectedEventId);
    return ev?.name || 'งานวิ่งปัจจุบัน';
  }, [events, selectedEventId]);

  const handleScan = (bib, preResolvedRunner = null) => {
    try {
      const result = processScan('Finish', bib, null, preResolvedRunner);
      
      if (!result.success) {
        setLedState({ 
          runner: result.runner || preResolvedRunner || { bib: String(bib || '—'), name: 'NOT FOUND', nat: '', age: '', cat: '' }, 
          message: result.message || 'NOT FOUND', 
          warn: true 
        });
      } else {
        setLedState({ 
          runner: result.runner, 
          message: result.message, 
          warn: false 
        });
      }
    } catch (e) {
      console.error('FinishLine handleScan error:', e);
    }
  };

  const recentLog = useMemo(() => {
    return scanLog.filter(log => log.station === 'Finish').slice(0, 15);
  }, [scanLog]);

  const handleClearRecentLog = async () => {
    const ok = await showConfirm(
      'ยืนยันล้างประวัติการสแกนเส้นชัยบนหน้านี้?',
      'ประวัติการสแกนบนหน้าจอนี้จะถูกล้างออก โดยข้อมูลใน Database จะยังคงอยู่เหมือนเดิม 100%'
    );
    if (ok) {
      clearStationScanLog('Finish');
    }
  };

  return (
    <div className="page active" style={{ paddingBottom: '40px' }}>
      <style>{`
        .station-header-bar {
          display: flex;
          justifyContent: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
        }
        .live-stat-card {
          background: #ffffff;
          border-radius: 14px;
          border: 1px solid var(--line);
          padding: 14px 16px;
          margin-bottom: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        }
        .stat-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 12px;
        }
        .stat-pill {
          padding: 10px 8px;
          border-radius: 10px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justifyContent: center;
        }
        .stat-pill .val {
          font-size: clamp(18px, 4vw, 24px);
          font-weight: 900;
          font-family: var(--mono);
          line-height: 1.1;
        }
        .stat-pill .lbl {
          font-size: 11px;
          color: var(--ink-2);
          font-weight: 600;
          margin-top: 3px;
        }
        @media (max-width: 768px) {
          .station-desktop-side {
            display: none !important;
          }
          .station-mobile-side {
            display: block !important;
          }
        }
        @media (min-width: 769px) {
          .station-mobile-side {
            display: none !important;
          }
        }
      `}</style>

      {/* ── Top Bar: Station Badge + Event Title + Setup Trigger Button ── */}
      <div className="station-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="station-tag tag-fin" style={{ margin: 0 }}>
            <span className="dot"></span>Station · Finish Line เส้นชัย
          </span>
          <span style={{ 
            fontSize: '12px', 
            fontWeight: 700, 
            color: 'var(--ink-2)', 
            background: 'var(--bg-soft)', 
            padding: '4px 10px', 
            borderRadius: '99px',
            border: '1px solid var(--line)',
            maxWidth: '220px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            🏆 {activeEventName}
          </span>
        </div>

        {/* Action Buttons: Setup & History Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setIsSetupOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '10px',
              background: '#ffffff',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(0,0,0,0.04)'
            }}
            title="เปิดเมนูตั้งค่าสถานีและตัวเลือกออฟไลน์"
          >
            <Settings size={16} color="#2563eb" />
            <span>ตั้งค่า</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '10px',
              background: showHistory ? '#eff6ff' : '#ffffff',
              border: `1px solid ${showHistory ? '#bfdbfe' : 'var(--line)'}`,
              color: showHistory ? '#1d4ed8' : 'var(--ink-2)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title={showHistory ? "ซ่อนประวัติการสแกน" : "แสดงประวัติการสแกน"}
          >
            <span>ประวัติ ({recentLog.length})</span>
            {showHistory ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* ── Real-Time Database Counter & Progress Card ── */}
      <div className="live-stat-card">
        <div className="stat-grid-3">
          {/* Finished Count */}
          <div className="stat-pill" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span className="val" style={{ color: '#15803d' }}>{stats.finished}</span>
            <span className="lbl" style={{ color: '#166534' }}>เข้าเส้นชัยแล้ว</span>
          </div>

          {/* Remaining in Race */}
          <div className="stat-pill" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <span className="val" style={{ color: '#b45309' }}>{stats.remaining}</span>
            <span className="lbl" style={{ color: '#92400e' }}>ในเส้นทาง/รอเข้า</span>
          </div>

          {/* Total Started / Registered */}
          <div className="stat-pill" style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)' }}>
            <span className="val" style={{ color: '#0f172a' }}>{stats.started}</span>
            <span className="lbl">
              {stats.dnsCount > 0 ? `ปล่อยตัว (${stats.total} สมัคร)` : 'นักวิ่งทั้งหมด'}
            </span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', marginBottom: '5px' }}>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>ความคืบหน้านักวิ่งเข้าเส้นชัย</span>
            <span style={{ fontWeight: 800, color: '#16a34a' }}>{stats.percent}% ({stats.finished}/{stats.started} คน)</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: `${stats.percent}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)', 
                borderRadius: '99px',
                transition: 'width 0.4s ease'
              }} 
            />
          </div>

          {/* DNF / DNS Badges if any */}
          {(stats.dnfCount > 0 || stats.dnsCount > 0) && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '11.5px' }}>
              {stats.dnfCount > 0 && (
                <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                  DNF ถอนตัว: {stats.dnfCount} คน
                </span>
              )}
              {stats.dnsCount > 0 && (
                <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                  DNS ไม่ได้สตาร์ท: {stats.dnsCount} คน
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Station Content ── */}
      <div className="station">
        <div>
          {/* Scanner Input with Manual Typing + Enter BIB + Camera */}
          <ScannerInput onScan={handleScan} />

          {/* Mobile Instant Scan Result Card */}
          <div className="station-mobile-side" style={{ marginTop: '12px' }}>
            <MobileScanResultCard
              runner={ledState.runner}
              message={ledState.message}
              warn={ledState.warn}
              categories={categories}
              stationName="Finish Line"
            />
          </div>

          <p className="scan-hint" style={{ marginTop: '10px' }}>
            สแกนซ้ำจะไม่ทับเวลาเดิม — ยึดเวลา Finish ครั้งแรกเสมอ · พิมพ์หมายเลข BIB แล้วกดปุ่ม <span className="kbd">Enter BIB</span> ได้
          </p>

          {/* Collapsible Recent Scan Log */}
          {showHistory && (
            <div className="card" style={{ marginTop: '14px', overflow: 'hidden' }}>
              {/* Header Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--bg-soft)',
                borderBottom: '1px solid var(--line)',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                    ประวัติการสแกนล่าสุด (Finish)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>
                    ({recentLog.length} รายการ)
                  </span>
                  {recentLog.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearRecentLog}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: '#fff',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        color: 'var(--ink-2)',
                        cursor: 'pointer'
                      }}
                      title="ล้างประวัติการสแกนบนหน้านี้"
                    >
                      <Trash2 size={12} /> ล้างประวัติ
                    </button>
                  )}
                </div>

                {/* Database Sync Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {pendingSyncQueue.length > 0 ? (
                    isOnline ? (
                      <span className="db-sync-badge syncing" style={{ fontSize: '11px', padding: '3px 8px' }}>
                        <RefreshCw size={11} className="spin" />
                        กำลังส่ง ({pendingSyncQueue.length})
                      </span>
                    ) : (
                      <span className="db-sync-badge offline" style={{ fontSize: '11px', padding: '3px 8px' }}>
                        <WifiOff size={11} />
                        ออฟไลน์ ({pendingSyncQueue.length})
                      </span>
                    )
                  ) : (
                    <span className="db-sync-badge synced" style={{ fontSize: '11px', padding: '3px 8px' }}>
                      <CheckCircle2 size={11} />
                      ซิงค์คลาวด์ 100%
                    </span>
                  )}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: '550px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '90px' }}>เวลา</th>
                      <th style={{ width: '90px' }}>BIB</th>
                      <th>ชื่อนักวิ่ง</th>
                      <th style={{ width: '110px' }}>ผู้สแกน</th>
                      <th style={{ textAlign: 'center', width: '90px' }}>สถานะ</th>
                      <th style={{ textAlign: 'right', width: '130px' }}>Database</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLog.map((log, i) => (
                      <tr key={log.syncId || log.id || `${log.bib}_${i}`}>
                        <td className="mono" style={{ fontSize: '12px' }}>{safeFormatTime(log.time)}</td>
                        <td className="mono" style={{ fontWeight: 800, color: '#16a34a' }}>{String(log.bib ?? '—')}</td>
                        <td style={{ fontWeight: 600 }}>{String(log.name ?? '—')}</td>
                        <td style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{log.operator || 'Staff'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {log.ok ? (
                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '12px' }}>✓ ผ่าน</span>
                          ) : log.isRescan ? (
                            <span style={{ color: '#d97706', fontWeight: 700, fontSize: '11px', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>⚠️ ซ้ำ</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '12px' }}>✗ ไม่พบ</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <ScanSyncBadge log={log} />
                        </td>
                      </tr>
                    ))}
                    {recentLog.length === 0 && <tr><td colSpan="6" className="empty">ยังไม่มีการสแกนในเซสชันนี้</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        
        {/* Desktop LED Board Column */}
        <div className="station-desktop-side">
          <LedBoard runner={ledState.runner} message={ledState.message} warn={ledState.warn} />
        </div>
      </div>

      {/* Unified Station Setup Modal */}
      <StationSetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        title="การตั้งค่าสถานี Finish Line เส้นชัย"
        stationTag="Station · Finish"
        onClearLog={handleClearRecentLog}
        scanCount={recentLog.length}
      />
    </div>
  );
}
