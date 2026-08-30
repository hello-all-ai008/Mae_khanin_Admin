import React from 'react';
import { useRace } from '../context/RaceContext';
import { 
  Zap, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Database, 
  CloudUpload, 
  CheckCircle2, 
  AlertTriangle,
  Clock,
  ShieldCheck,
  Layers,
  Flag,
  UserCheck,
  Check
} from 'lucide-react';

export default function PreloadDataCard({ eventId }) {
  const { 
    runners, 
    categories,
    checkpoints,
    currentOperator,
    isOnline, 
    isPreloading, 
    preloadProgress, 
    preloadStatusText, 
    lastSyncedTime, 
    pendingSyncQueue, 
    isSyncingQueue,
    preloadEventData, 
    syncPendingQueue 
  } = useRace();

  const formatLastSync = (timestamp) => {
    if (!timestamp) return null;
    const d = new Date(timestamp);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.';
  };

  // Determine Data Readiness Status
  const isDataReady = runners && runners.length > 0 && lastSyncedTime !== null;
  const isZeroRunners = runners && runners.length === 0;

  return (
    <div 
      className="card" 
      style={{ 
        background: isDataReady ? '#f8fafc' : '#fffbeb', 
        border: isDataReady ? '1px solid #cbd5e1' : '1.5px solid #f59e0b', 
        borderRadius: '14px', 
        padding: '14px 18px', 
        marginBottom: '16px',
        boxShadow: isDataReady ? '0 2px 8px rgba(0,0,0,0.03)' : '0 4px 12px rgba(245, 158, 11, 0.12)'
      }}
    >
      {/* ── Main Status & Action Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        
        {/* Left: Readiness Banner & Pre-load Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          
          {/* Main System Readiness Badge */}
          {isDataReady ? (
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '6px 12px', 
              borderRadius: '24px', 
              background: '#dcfce7', 
              color: '#15803d', 
              border: '1px solid #86efac',
              fontWeight: 700,
              fontSize: '13px'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>
              ✓ ข้อมูลพร้อมสแกน 100%
            </div>
          ) : isZeroRunners ? (
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '6px 12px', 
              borderRadius: '24px', 
              background: '#fee2e2', 
              color: '#b91c1c', 
              border: '1px solid #fca5a5',
              fontWeight: 700,
              fontSize: '13px'
            }}>
              <AlertTriangle size={15} /> ยังไม่มีข้อมูลนักวิ่ง
            </div>
          ) : (
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '6px 12px', 
              borderRadius: '24px', 
              background: '#fef3c7', 
              color: '#92400e', 
              border: '1px solid #fde68a',
              fontWeight: 700,
              fontSize: '13px'
            }}>
              <AlertTriangle size={15} /> ยังไม่ได้เตรียมข้อมูลออฟไลน์
            </div>
          )}

          {/* Action Preload Button */}
          <button
            type="button"
            className="btn"
            onClick={() => preloadEventData(eventId)}
            disabled={isPreloading}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '7px 14px', 
              fontSize: '12.5px', 
              fontWeight: 700,
              borderRadius: '8px',
              cursor: isPreloading ? 'not-allowed' : 'pointer',
              background: isDataReady ? 'var(--bg-soft)' : '#1e293b',
              color: isDataReady ? 'var(--ink)' : '#ffffff',
              border: isDataReady ? '1px solid var(--line)' : 'none'
            }}
          >
            {isPreloading ? (
              <><RefreshCw size={14} className="spin" /> กำลังเตรียมข้อมูล...</>
            ) : (
              <><Zap size={14} style={{ color: isDataReady ? 'var(--warn)' : '#facc15' }} /> {isDataReady ? 'รีเฟรชเตรียมข้อมูล' : '⚡ กดเตรียมข้อมูลตอนนี้'}</>
            )}
          </button>

          {/* Network Status */}
          <span style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '5px', 
            fontSize: '12px', 
            fontWeight: 600, 
            padding: '4px 10px', 
            borderRadius: '20px', 
            background: isOnline ? '#ecfdf5' : '#fee2e2', 
            color: isOnline ? '#059669' : '#b91c1c',
            border: isOnline ? '1px solid #a7f3d0' : '1px solid #fca5a5'
          }}>
            {isOnline ? <><Wifi size={13} /> ออนไลน์</> : <><WifiOff size={13} /> ออฟไลน์</>}
          </span>

        </div>

        {/* Right: Pending Queue & Sync */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pendingSyncQueue.length > 0 && (
            <button
              type="button"
              onClick={syncPendingQueue}
              className="btn"
              style={{ 
                background: isSyncingQueue ? '#eff6ff' : '#fef3c7', 
                color: isSyncingQueue ? '#1d4ed8' : '#92400e', 
                border: isSyncingQueue ? '1px solid #bfdbfe' : '1px solid #fde68a', 
                padding: '6px 12px', 
                fontSize: '12px', 
                fontWeight: 700,
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              title={isSyncingQueue ? "ระบบกำลังทยอยส่งข้อมูลขึ้นคลาวด์ในพื้นหลัง" : "กดเพื่อเร่งการส่งข้อมูลขึ้นคลาวด์"}
            >
              <CloudUpload size={14} className={isSyncingQueue ? 'spin' : ''} /> 
              {isSyncingQueue ? `กำลังส่งขึ้นคลาวด์ (${pendingSyncQueue.length})` : `รอซิงค์คลาวด์ (${pendingSyncQueue.length})`}
            </button>
          )}

          <button
            type="button"
            onClick={() => preloadEventData(eventId)}
            title="อัปเดตข้อมูลล่าสุด"
            className="btn btn-sm"
            style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)' }}
          >
            <RefreshCw size={14} className={isPreloading ? 'spin' : ''} />
          </button>
        </div>

      </div>

      {/* ── Readiness Checklist Details Strip ── */}
      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--ink)' }}>
          <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>รายการข้อมูล:</span>
          
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: runners.length > 0 ? '#15803d' : '#b91c1c' }}>
            <Database size={13} /> นักวิ่ง: <b>{runners.length}</b> คน
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: categories.length > 0 ? '#15803d' : '#64748b' }}>
            <Layers size={13} /> ระยะทาง: <b>{categories.length}</b> รุ่น
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: checkpoints.length > 0 ? '#15803d' : '#64748b' }}>
            <Flag size={13} /> จุดตรวจ: <b>{checkpoints.length}</b> จุด
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--ink)' }}>
            <UserCheck size={13} /> ผู้สแกน: <b>{currentOperator || '—'}</b>
          </span>
        </div>

        {lastSyncedTime && (
          <div style={{ fontSize: '11.5px', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> อัปเดตล่าสุด: {formatLastSync(lastSyncedTime)}
          </div>
        )}
      </div>

      {/* ── Progress Loading Bar (Visible when preloading) ── */}
      {isPreloading && (
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span className="dot" style={{ background: 'var(--start)' }}></span> {preloadStatusText}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>
              {preloadProgress}%
            </span>
          </div>

          <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: `${preloadProgress}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, #10b981 0%, #06b6d4 100%)', 
                borderRadius: '6px',
                transition: 'width 0.3s ease-out'
              }}
            />
          </div>
        </div>
      )}

      {/* Helper advice if offline */}
      {!isOnline && (
        <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={13} />
          <span><b>โหมดออฟไลน์:</b> สแกนและบันทึกเวลาลงหน่วยความจำของเครื่องทันทีโดยไม่สะดุด ข้อมูลจะซิงค์ให้อัตโนมัติเมื่อต่อเน็ต</span>
        </div>
      )}
    </div>
  );
}
