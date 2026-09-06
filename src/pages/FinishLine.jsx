import { useState, useMemo } from 'react';
import { RefreshCw, CheckCircle2, WifiOff, Trash2 } from 'lucide-react';
import { useRace } from '../context/RaceContext';
import LedBoard from '../components/LedBoard';
import ScannerInput from '../components/ScannerInput';
import PreloadDataCard from '../components/PreloadDataCard';
import ScanSyncBadge from '../components/ScanSyncBadge';

export default function FinishLine() {
  const { 
    events, 
    selectedEventId, 
    setSelectedEventId, 
    runners, 
    loadingRunners, 
    processScan, 
    scanLog,
    clearStationScanLog,
    showConfirm,
    pendingSyncQueue,
    isOnline
  } = useRace();
  const [ledState, setLedState] = useState({ runner: null, message: '', warn: false });

  const fmtDur = (ms) => {
    if (ms == null) return '—';
    const s = Math.floor(ms / 1e3);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  const handleScan = (bib) => {
    const result = processScan('Finish', bib);
    
    if (!result.success) {
      setLedState({ 
        runner: result.runner || { bib, name: 'NOT FOUND', nat: '', age: '', cat: '' }, 
        message: result.message, 
        warn: true 
      });
    } else {
      setLedState({ 
        runner: result.runner, 
        message: result.message, 
        warn: false 
      });
    }
  };

  const recentLog = useMemo(() => {
    return scanLog.filter(log => log.station === 'Finish').slice(0, 10);
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
    <div className="page active">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="station-tag tag-fin"><span className="dot"></span>Station · Finish</span>
          <h1>Finish Line เส้นชัย</h1>
          <p>ยิงบาร์โค้ดเมื่อนักวิ่งเข้าเส้นชัย ระบบคำนวณ Total Time และจัดอันดับให้ทันที</p>
        </div>

        {/* Event Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-soft)', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>เลือกงานวิ่ง:</label>
          <select 
            className="search" 
            style={{ width: '220px', padding: '6px 10px', fontSize: '0.85rem' }}
            value={selectedEventId} 
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            {events.length === 0 && <option value="">ไม่มีงานวิ่งในระบบ</option>}
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>
            {loadingRunners ? 'กำลังโหลด...' : `(${runners.length} คน)`}
          </span>
        </div>
      </div>
      
      {/* Preload & Offline Cache Bar */}
      <PreloadDataCard eventId={selectedEventId} />

      <div className="station">
        <div>
          <ScannerInput onScan={handleScan} />
          <p className="scan-hint">สแกนซ้ำจะไม่ทับเวลาเดิม — ยึดเวลา Finish ครั้งแรกเสมอ · พิมพ์หมายเลข BIB แล้วกดปุ่ม <span className="kbd">Enter BIB</span> ได้</p>
          
          <div className="card" style={{ marginTop: '16px', overflow: 'hidden' }}>
            {/* Real-time Database Status Header Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 16px',
              background: 'var(--bg-soft)',
              borderBottom: '1px solid var(--line)',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                  ประวัติการสแกนล่าสุด (Finish)
                </span>
                <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>
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
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    title="ล้างประวัติการสแกนบนหน้านี้ (ข้อมูลใน Database ไม่ได้รับผลกระทบ)"
                  >
                    <Trash2 size={12} /> ล้างประวัติ
                  </button>
                )}
              </div>

              {/* Status Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {pendingSyncQueue.length > 0 ? (
                  isOnline ? (
                    <span className="db-sync-badge syncing" title="ระบบกำลังทยอยส่งข้อมูลขึ้น Database ในพื้นหลัง">
                      <RefreshCw size={12} className="spin" />
                      กำลังส่งไป Database ({pendingSyncQueue.length} รายการ)...
                    </span>
                  ) : (
                    <span className="db-sync-badge offline" title="บันทึกลงในเครื่องเรียบร้อย จะส่งไป Database อัตโนมัติเมื่อมีเน็ต">
                      <WifiOff size={12} />
                      ออฟไลน์: บันทึกในเครื่อง ({pendingSyncQueue.length} รอส่ง)
                    </span>
                  )
                ) : (
                  <span className="db-sync-badge synced" title="ข้อมูลเชื่อมโยงคลาวด์ Database เรียบร้อย">
                    <CheckCircle2 size={12} />
                    Database: ข้อมูลตรงกัน 100%
                  </span>
                )}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '165px' }}>เวลา</th>
                    <th style={{ width: '155px' }}>BIB</th>
                    <th style={{ minWidth: '260px' }}>ชื่อนักวิ่ง</th>
                    <th style={{ width: '200px' }}>ผู้สแกน</th>
                    <th style={{ textAlign: 'center', width: '150px' }}>สแกน</th>
                    <th style={{ textAlign: 'right', width: '220px' }}>ส่ง Database</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLog.map((log, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ width: '165px' }}>{new Date(log.time).toTimeString().slice(0, 8)}</td>
                      <td className="mono" style={{ width: '155px', fontWeight: 700, color: 'var(--ink)' }}>{log.bib}</td>
                      <td style={{ minWidth: '260px', fontWeight: 500 }}>{log.name}</td>
                      <td style={{ width: '200px', fontSize: '12px', color: 'var(--ink-2)' }}>
                        {log.operator ? `👤 ${log.operator}` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', width: '150px' }}>
                        {log.ok ? (
                          log.isRescan ? (
                            <span style={{ color: '#0284c7', fontWeight: 600, fontSize: '11px', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }} title={log.msg || "สแกนซ้ำ — ยึดเวลาแรก"}>
                              ✓ สแกนซ้ำ
                            </span>
                          ) : (
                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '13px' }}>✓</span>
                          )
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '13px' }}>✗</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', width: '220px' }}>
                        <ScanSyncBadge log={log} />
                      </td>
                    </tr>
                  ))}
                  {recentLog.length === 0 && <tr><td colSpan="6" className="empty">ยังไม่มีการสแกน</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <LedBoard runner={ledState.runner} message={ledState.message} warn={ledState.warn} />
      </div>
    </div>
  );
}
