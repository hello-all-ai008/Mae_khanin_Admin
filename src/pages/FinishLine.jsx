import { useState, useMemo, useEffect, useRef } from 'react';
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
import { supabase } from '../lib/supabaseClient';
import LedBoard from '../components/LedBoard';
import ScannerInput from '../components/ScannerInput';
import ScanSyncBadge from '../components/ScanSyncBadge';
import StationSetupModal from '../components/StationSetupModal';
import MobileScanResultCard from '../components/MobileScanResultCard';
import NetworkModeToggle from '../components/NetworkModeToggle';

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
    isOnline,
    networkMode
  } = useRace();
  
  const [ledState, setLedState] = useState({ runner: null, message: '', warn: false });
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  // Persistent Supabase Realtime channel for cross-device / cross-origin monitor casting
  const monitorChannelRef = useRef(null);

  useEffect(() => {
    const channel = supabase.channel('rohn_monitor_stream', {
      config: { broadcast: { ack: false } }
    });
    channel.subscribe();
    monitorChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      monitorChannelRef.current = null;
    };
  }, []);

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

  const castToMonitor = (targetMonitorId, runnerData, totalTime, firstTime) => {
    if (!targetMonitorId || targetMonitorId === 'none' || !runnerData) return;

    const eventPayload = {
      type: 'ROHN_MONITOR_CAST',
      source: 'rohn_admin_finish',
      monitorId: targetMonitorId,
      bib: runnerData.bib || '',
      name: runnerData.name || '',
      distance: (runnerData.distance || runnerData.cat || '').toString().toUpperCase().replace(/\s+/g, ''),
      ageGroup: runnerData.age_group || runnerData.ageGroup || runnerData.age || '-',
      finishTime: totalTime,
      finishAt: firstTime,
      timestamp: Date.now()
    };

    // 1. Supabase Realtime Broadcast (Works across different origins, browsers, and devices)
    try {
      if (monitorChannelRef.current) {
        monitorChannelRef.current.send({
          type: 'broadcast',
          event: 'monitor_cast',
          payload: eventPayload
        });
      }
    } catch (e) {
      console.warn('Supabase monitor broadcast failed:', e);
    }

    if (selectedEventId) {
      try {
        const evChannel = supabase.channel(`results:${selectedEventId}`);
        evChannel.send({
          type: 'broadcast',
          event: 'monitor_cast',
          payload: eventPayload
        }).catch(() => {});
      } catch (e) {}
    }

    // 2. LocalStorage & BroadcastChannel (Fast same-origin fallback)
    try {
      localStorage.setItem('react_cast_event', JSON.stringify(eventPayload));
      localStorage.setItem('rohn_monitor_cast', JSON.stringify(eventPayload));
    } catch (e) {}

    try {
      const bc1 = new BroadcastChannel('rohn_monitor_channel');
      bc1.postMessage(eventPayload);
      bc1.close();
    } catch (e) {}

    try {
      const bc2 = new BroadcastChannel('react_cast_event');
      bc2.postMessage(eventPayload);
      bc2.close();
    } catch (e) {}
  };

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
        if (!result.isRescan) {
          const targetMonitorId = localStorage.getItem('rohn_checkin_monitor_id') || '1';
          castToMonitor(targetMonitorId, result.runner, result.totalTime, result.firstTime);
        }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span className="station-tag tag-fin" style={{ margin: 0, padding: '4px 10px', fontSize: '11.5px' }}>
            <span className="dot"></span>Finish Line เส้นชัย
          </span>
          <span style={{ 
            fontSize: '11.5px', 
            fontWeight: 700, 
            color: 'var(--ink-2)', 
            background: 'var(--bg-soft)', 
            padding: '3px 8px', 
            borderRadius: '99px',
            border: '1px solid var(--line)',
            maxWidth: '180px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            🏆 {activeEventName}
          </span>
        </div>

        {/* Action Buttons: Network Mode, Setup & History Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <NetworkModeToggle />

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
            title="เปิดเมนูตั้งค่าสถานีและตัวเลือกออฟไลน์"
          >
            <Settings size={15} color="#2563eb" />
            <span>ตั้งค่า</span>
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

        {/* Visual Progress Bar (Compact 4px) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', marginBottom: '3px' }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>ความคืบหน้า</span>
            <span style={{ fontWeight: 800, color: '#16a34a' }}>{stats.percent}% ({stats.finished}/{stats.started} คน)</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
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

          {/* DNF / DNS Badges if any (Compact) */}
          {(stats.dnfCount > 0 || stats.dnsCount > 0) && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', fontSize: '10.5px' }}>
              {stats.dnfCount > 0 && (
                <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  DNF: {stats.dnfCount} คน
                </span>
              )}
              {stats.dnsCount > 0 && (
                <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  DNS: {stats.dnsCount} คน
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
          <div className="station-mobile-side" style={{ marginTop: '10px' }}>
            <MobileScanResultCard
              runner={ledState.runner}
              message={ledState.message}
              warn={ledState.warn}
              categories={categories}
              stationName="Finish Line"
            />
          </div>

          {/* Collapsible Recent Scan Log */}
          {showHistory && (
            <div className="card" style={{ marginTop: '14px', overflow: 'hidden', borderRadius: '14px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
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
                        {networkMode === 'offline' ? 'โหมดออฟไลน์' : 'ออฟไลน์'} ({pendingSyncQueue.length})
                      </span>
                    )
                  ) : (
                    <span className="db-sync-badge synced" style={{ fontSize: '11px', padding: '3px 8px' }}>
                      <CheckCircle2 size={11} />
                      {networkMode === 'offline' ? 'ออฟไลน์ (พร้อมสแกน)' : 'ซิงค์คลาวด์ 100%'}
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
