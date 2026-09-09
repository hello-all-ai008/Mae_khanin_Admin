import { useState, useMemo } from 'react';
import { RefreshCw, CheckCircle2, WifiOff, Trash2, Settings, ChevronDown, ChevronUp, MapPin, Flag, Layers, Lock } from 'lucide-react';
import { useRace, CHECKPOINTS } from '../context/RaceContext';
import LedBoard from '../components/LedBoard';
import ScannerInput from '../components/ScannerInput';
import ScanSyncBadge from '../components/ScanSyncBadge';
import StationSetupModal from '../components/StationSetupModal';
import MobileScanResultCard from '../components/MobileScanResultCard';

const safeFormatTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('th-TH', { 
    timeZone: 'Asia/Bangkok',
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
};

export default function CheckPoint() {
  const {
    events,
    selectedEventId,
    setSelectedEventId,
    runners,
    loadingRunners,
    categories,
    categoryCheckpoints,
    checkpoints,
    processScan,
    scanLog,
    clearStationScanLog,
    showConfirm,
    getCpName,
    currentStaff,
    pendingSyncQueue,
    isOnline
  } = useRace();
  const [ledState, setLedState] = useState({ runner: null, message: '', warn: false });
  const [selectedCp, setSelectedCp] = useState(() => {
    return localStorage.getItem('trail_selected_cp') || '';
  });
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const handleSelectCp = (cpId) => {
    setSelectedCp(cpId);
    if (cpId) {
      try {
        localStorage.setItem('trail_selected_cp', cpId);
      } catch {}
    }
  };

  // Keep selectedCp in sync with available checkpoints from database.
  // Only offer type === 'CP' stations here — START/FINISH belong to their own pages.
  const activeCpList = useMemo(() => {
    if (!checkpoints || checkpoints.length === 0) return CHECKPOINTS;
    const hasTypeData = checkpoints.some(cp => cp.type);
    if (!hasTypeData) return checkpoints;
    return checkpoints.filter(cp => cp.type === 'CP');
  }, [checkpoints]);

  // Staff assigned to one station (station_id set) must stay locked to it —
  // only staff with no fixed station (e.g. roaming admin) get the free picker.
  const lockedStationId = currentStaff?.station_id || null;
  const isStationLocked = Boolean(
    lockedStationId && activeCpList.some(cp => cp.id === lockedStationId || cp.name === lockedStationId)
  );

  const validSelectedCp = activeCpList.some(cp => cp.id === selectedCp || cp.name === selectedCp) ? selectedCp : '';

  const currentCpId = isStationLocked
    ? lockedStationId
    : (validSelectedCp || (activeCpList[0]?.id || 'A1'));

  const cpIndex = activeCpList.findIndex(cp => cp.id === currentCpId);
  const cpLabel = cpIndex !== -1 ? `A${cpIndex + 1}` : 'CP';
  const cpFullName = getCpName(currentCpId);

  const activeEventName = useMemo(() => {
    const ev = (events || []).find(e => e.id === selectedEventId);
    return ev?.name || 'งานวิ่งปัจจุบัน';
  }, [events, selectedEventId]);

  // Database-backed Station Passing Count according to DatabaseFlow.jsx
  // Each category is bound to stations via `checkpoint` table (category_id, station_id).
  const stats = useMemo(() => {
    const cleanRunners = (runners || []).filter(r => r.bib !== 'RUNNER_CONFIG' && !String(r.bib || '').startsWith('__'));
    
    // Find matching checkpoint rows for this station
    const matchingCps = (categoryCheckpoints || []).filter(cp => {
      return cp.station_id === currentCpId || 
             cp.id === currentCpId ||
             (cp.stations && (cp.stations.name === cpFullName || cp.stations.id === currentCpId));
    });

    const boundCategoryIds = new Set(matchingCps.map(cp => cp.category_id).filter(Boolean));
    
    // Determine bound category names
    const boundCatNames = (categories || [])
      .filter(c => boundCategoryIds.has(c.id))
      .map(c => c.name || c.code);

    // If specific categories are bound, scope runners to those categories; otherwise all active runners
    let targetRunners = cleanRunners;
    if (boundCategoryIds.size > 0) {
      targetRunners = cleanRunners.filter(r => 
        (r.category_id && boundCategoryIds.has(r.category_id)) || 
        (r.cat && boundCatNames.includes(r.cat))
      );
    }

    // Filter out DNS (did not start)
    targetRunners = targetRunners.filter(r => r.race_status !== 'DNS');

    // Count runners who scanned/passed this station
    const passed = targetRunners.filter(r => {
      if (!r.cps || typeof r.cps !== 'object') return false;
      return Boolean(
        r.cps[currentCpId] || 
        (cpFullName && r.cps[cpFullName]) || 
        r.cps[cpLabel] ||
        (cpLabel === 'A1' && (r.cps.a1 || r.cps['A1'])) ||
        (cpLabel === 'A2' && (r.cps.a2 || r.cps['A2'])) ||
        (cpLabel === 'A3' && (r.cps.a3 || r.cps['A3'])) ||
        (cpLabel === 'A4' && (r.cps.a4 || r.cps['A4']))
      );
    }).length;

    const total = targetRunners.length;
    const remaining = Math.max(0, total - passed);
    const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

    return { total, passed, remaining, percent, boundCatNames, cpLabel, cpFullName };
  }, [runners, categoryCheckpoints, categories, currentCpId, cpLabel, cpFullName]);

  const handleScan = (bib, preResolvedRunner = null) => {
    try {
      const result = processScan('CheckPoint', bib, currentCpId, preResolvedRunner);
      
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
      console.error('CheckPoint handleScan error:', e);
    }
  };

  const recentLog = useMemo(() => {
    const cpName = getCpName(currentCpId);
    return scanLog.filter(log => (
      log.station === cpName || 
      log.stationId === currentCpId || 
      log.station === currentCpId ||
      log.station === cpLabel
    )).slice(0, 15);
  }, [scanLog, currentCpId, getCpName, cpLabel]);

  const handleClearRecentLog = async () => {
    const cpName = getCpName(currentCpId);
    const ok = await showConfirm(
      `ยืนยันล้างประวัติการสแกน (${cpName}) บนหน้านี้?`,
      'ประวัติการสแกนบนหน้าจอนี้จะถูกล้างออก โดยข้อมูลใน Database จะยังคงอยู่เหมือนเดิม 100%'
    );
    if (ok) {
      clearStationScanLog(cpName);
      if (currentCpId && currentCpId !== cpName) {
        clearStationScanLog(currentCpId);
      }
    }
  };

  // Extra Setup Controls for Station CP Selector
  const cpSetupControls = (
    <div>
      <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <MapPin size={16} style={{ color: '#2563eb' }} />
        เลือกจุด Check Point ประจำสถานี:
      </label>
      {isStationLocked ? (
        <div style={{
          padding: '10px 12px',
          borderRadius: '8px',
          background: '#f1f5f9',
          border: '1px solid #cbd5e1',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          color: '#334155',
          fontSize: '13px'
        }}>
          <Lock size={15} color="#64748b" />
          <span>{cpLabel} · {cpFullName}</span>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginLeft: 'auto' }}>(ล็อกตามบัญชีเจ้าหน้าที่)</span>
        </div>
      ) : (
        <select 
          className="search" 
          style={{ width: '100%', padding: '10px 12px', fontSize: '14px', fontWeight: 700, borderRadius: '8px', background: '#fff', border: '1px solid var(--line)' }}
          value={currentCpId} 
          onChange={(e) => handleSelectCp(e.target.value)}
        >
          {activeCpList.map((cp, idx) => (
            <option key={cp.id} value={cp.id}>
              {`A${idx + 1} — ${cp.name || `Checkpoint ${idx + 1}`}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <div className="page active" style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <style>{`
        .station-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
          width: 100%;
          box-sizing: border-box;
        }
        .live-stat-card {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid var(--line);
          padding: 8px 10px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.02);
          margin-bottom: 8px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }
        .stat-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 6px;
          width: 100%;
          box-sizing: border-box;
        }
        .stat-pill {
          background: var(--bg-soft);
          border-radius: 8px;
          padding: 5px 4px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
        }
        .stat-pill .val {
          font-size: clamp(15px, 4.2vw, 19px);
          font-weight: 800;
          font-family: var(--mono);
          line-height: 1.1;
        }
        .stat-pill .lbl {
          font-size: clamp(9px, 2.7vw, 11px);
          color: var(--ink-2);
          font-weight: 600;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 768px) {
          .station {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .station-desktop-side {
            display: none !important;
          }
          .station-mobile-side {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
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
          <span className="station-tag tag-cp" style={{ margin: 0 }}>
            <span className="dot"></span>{cpLabel} · Check Point
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setIsSetupOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '9px',
              background: '#ffffff',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
            }}
            title="เปิดเมนูเลือกจุดตรวจ A1/A2 และการตั้งค่า"
          >
            <Settings size={15} color="#2563eb" />
            <span>ตั้งค่า ({cpLabel})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '9px',
              background: showHistory ? '#eff6ff' : '#ffffff',
              border: `1px solid ${showHistory ? '#bfdbfe' : 'var(--line)'}`,
              color: showHistory ? '#1d4ed8' : 'var(--ink-2)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title={showHistory ? "ซ่อนประวัติการสแกน" : "แสดงประวัติการสแกน"}
          >
            <span>ประวัติ ({recentLog.length})</span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Real-Time Database Counter & Progress Card (Per Station) ── */}
      <div className="live-stat-card">
        <div className="stat-grid-3">
          {/* Passed Count */}
          <div className="stat-pill" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span className="val" style={{ color: '#15803d' }}>{stats.passed}</span>
            <span className="lbl" style={{ color: '#166534' }}>ผ่านจุดนี้แล้ว</span>
          </div>

          {/* Remaining Count */}
          <div className="stat-pill" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <span className="val" style={{ color: '#b45309' }}>{stats.remaining}</span>
            <span className="lbl" style={{ color: '#92400e' }}>ยังไม่ผ่าน</span>
          </div>

          {/* Target for this station */}
          <div className="stat-pill" style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)' }}>
            <span className="val" style={{ color: '#0f172a' }}>{stats.total}</span>
            <span className="lbl">เป้าหมายจุดนี้</span>
          </div>
        </div>

        {/* Visual Progress Bar (Compact 4px) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', marginBottom: '3px', flexWrap: 'wrap', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>ความคืบหน้า {cpLabel}</span>
              {stats.boundCatNames.length > 0 && (
                <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                  ({stats.boundCatNames.join(', ')})
                </span>
              )}
            </div>
            <span style={{ fontWeight: 800, color: '#2563eb' }}>{stats.percent}% ({stats.passed}/{stats.total} คน)</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: `${stats.percent}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, #0284c7 0%, #2563eb 100%)', 
                borderRadius: '99px',
                transition: 'width 0.4s ease'
              }} 
            />
          </div>
        </div>
      </div>

      {/* ── Main Station Content: Left Scanner + Right LED (Desktop) ── */}
      <div className="station">
        <div>
          {/* Main Scanner Input Box & Camera Controls */}
          <ScannerInput onScan={handleScan} />

          {/* Instant Scan Feedback Card (Mobile-First) */}
          <div className="station-mobile-side" style={{ marginTop: '12px' }}>
            <MobileScanResultCard 
              runner={ledState.runner} 
              message={ledState.message} 
              warn={ledState.warn} 
              categories={categories}
              stationName={cpLabel}
            />
          </div>

          {/* Collapsible Recent Scans History */}
          {showHistory && (
            <div className="card" style={{ marginTop: '16px', overflow: 'hidden', borderRadius: '14px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
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
                    ประวัติการสแกน ({cpLabel})
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
                        ซิงค์ Database ({pendingSyncQueue.length})...
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
              <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ minWidth: '450px', width: '100%' }}>
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
                        <td className="mono" style={{ fontWeight: 800, color: '#0284c7' }}>{String(log.bib ?? '—')}</td>
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
        title="การตั้งค่าจุดตรวจ Check Point"
        stationTag={`Station · ${cpLabel} (${cpFullName})`}
        extraControls={cpSetupControls}
        onClearLog={handleClearRecentLog}
        scanCount={recentLog.length}
      />
    </div>
  );
}
