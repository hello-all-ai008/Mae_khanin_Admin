import { useState, useMemo } from 'react';
import { RefreshCw, CheckCircle2, WifiOff, Tv, ExternalLink, Trash2 } from 'lucide-react';
import { useRace } from '../context/RaceContext';
import LedBoard from '../components/LedBoard';
import ScannerInput from '../components/ScannerInput';
import PreloadDataCard from '../components/PreloadDataCard';
import ScanSyncBadge from '../components/ScanSyncBadge';

const safeFormatTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toTimeString().slice(0, 8);
};

export default function CheckIn() {
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
  const [monitorId, setMonitorId] = useState(() => {
    return localStorage.getItem('rohn_checkin_monitor_id') || '1';
  });
  const [openedMonitor, setOpenedMonitor] = useState(null);

  const castToMonitor = (targetMonitorId, runnerData) => {
    if (!targetMonitorId || targetMonitorId === 'none' || !runnerData) return;

    const eventPayload = {
      type: 'ROHN_MONITOR_CAST',
      source: 'rohn_admin_checkin',
      monitorId: targetMonitorId,
      bib: runnerData.bib || '',
      name: runnerData.name || '',
      distance: (runnerData.distance || runnerData.cat || '').toString().toUpperCase().replace(/\s+/g, ''),
      ageGroup: runnerData.age_group || runnerData.ageGroup || runnerData.age || '-',
      timestamp: Date.now()
    };

    // 1. Broadcast via localStorage (for same-origin windows/tabs)
    try {
      localStorage.setItem('react_cast_event', JSON.stringify(eventPayload));
      localStorage.setItem('rohn_monitor_cast', JSON.stringify(eventPayload));
    } catch (e) {}

    // 2. Broadcast via BroadcastChannel
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

    // 3. PostMessage to popup monitor window if opened
    if (openedMonitor && !openedMonitor.closed) {
      try {
        openedMonitor.postMessage(eventPayload, '*');
      } catch (e) {}
    }
  };

  const openMonitorWindow = () => {
    const targetUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `http://${window.location.hostname}:5174/monitor/${monitorId === 'all' ? '1' : monitorId}`
      : `https://rohn-runner.vercel.app/monitor/${monitorId === 'all' ? '1' : monitorId}`;
    
    const win = window.open(
      targetUrl, 
      `rohn_monitor_${monitorId}`, 
      'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no'
    );
    if (win) {
      setOpenedMonitor(win);
    }
  };

  const handleScan = (bib) => {
    try {
      const result = processScan('Check-in', bib);
      
      if (!result.success) {
        const notFoundRunner = result.runner || { bib: String(bib || '—'), name: 'NOT FOUND', nat: '', age: '', cat: '' };
        setLedState({ 
          runner: notFoundRunner, 
          message: result.message || 'NOT FOUND', 
          warn: true 
        });
        if (monitorId && monitorId !== 'none') {
          castToMonitor(monitorId, { bib: String(bib || '—'), name: 'NOT FOUND', cat: '-', age: '-' });
        }
      } else {
        setLedState({ 
          runner: result.runner, 
          message: result.message, 
          warn: false 
        });
        if (monitorId && monitorId !== 'none' && result.runner) {
          castToMonitor(monitorId, result.runner);
        }
      }
    } catch (e) {
      console.error('CheckIn handleScan error:', e);
    }
  };

  const recentLog = useMemo(() => {
    return scanLog.filter(log => log.station === 'Check-in').slice(0, 10);
  }, [scanLog]);

  const handleClearRecentLog = async () => {
    const ok = await showConfirm(
      'ยืนยันล้างประวัติการสแกนบนหน้านี้?',
      'ประวัติการสแกนบนหน้าจอนี้จะถูกล้างออก โดยข้อมูลใน Database จะยังคงอยู่เหมือนเดิม 100%'
    );
    if (ok) {
      clearStationScanLog('Check-in');
    }
  };

  return (
    <div className="page active">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="station-tag tag-start"><span className="dot"></span>Station · Start</span>
          <h1>Check-in จุดปล่อยตัว</h1>
          <p>ยิงบาร์โค้ดบน BIB หรือพิมพ์หมายเลขแล้วกด Enter — ระบบบันทึกเวลาเช็คอินอัตโนมัติ</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Event Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-soft)', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>เลือกงานวิ่ง:</label>
            <select 
              className="search" 
              style={{ width: '200px', padding: '6px 10px', fontSize: '0.85rem' }}
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

          {/* Monitor Screen Selector (Combo Box for Rohn-Runner Monitor) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-soft)', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Tv size={16} style={{ color: '#2563eb' }} />
              แสดงผลจอ Monitor:
            </label>
            <select 
              className="search" 
              style={{ width: '155px', padding: '6px 10px', fontSize: '0.85rem', fontWeight: 700, color: monitorId === 'none' ? 'var(--ink-2)' : '#16a34a' }}
              value={monitorId} 
              onChange={(e) => {
                const val = e.target.value;
                setMonitorId(val);
                localStorage.setItem('rohn_checkin_monitor_id', val);
              }}
            >
              <option value="1">🖥️ Monitor 1</option>
              <option value="2">🖥️ Monitor 2</option>
              <option value="3">🖥️ Monitor 3</option>
              <option value="4">🖥️ Monitor 4</option>
              <option value="5">🖥️ Monitor 5</option>
              <option value="all">🌐 ทุกจอ (All)</option>
              <option value="none">❌ ปิด (ไม่ส่งขึ้นจอ)</option>
            </select>
            {monitorId !== 'none' && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={openMonitorWindow}
                title="เปิดหน้าจอ Monitor ในหน้าต่างใหม่ เพื่อนำไปแสดงบนทีวีหรือจอโปรเจกเตอร์"
                style={{ padding: '6px 10px', fontSize: '12px', background: '#fff', color: '#000', border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                <ExternalLink size={13} /> เปิดจอ
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Preload & Offline Cache Bar */}
      <PreloadDataCard eventId={selectedEventId} />

      <div className="station">
        <div>
          <ScannerInput onScan={handleScan} />
          <p className="scan-hint">ยิงบาร์โค้ด หรือพิมพ์หมายเลข BIB แล้วกดปุ่ม <span className="kbd">Enter BIB</span> หรือกด Enter บนแป้นพิมพ์</p>
          
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
                  ประวัติการสแกนล่าสุด
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
                    <tr key={log.syncId || log.id || `${log.bib}_${i}`}>
                      <td className="mono" style={{ width: '165px' }}>{safeFormatTime(log.time)}</td>
                      <td className="mono" style={{ width: '155px', fontWeight: 700, color: 'var(--ink)' }}>{String(log.bib ?? '—')}</td>
                      <td style={{ minWidth: '260px', fontWeight: 500 }}>{String(log.name ?? '—')}</td>
                      <td style={{ width: '200px', fontSize: '12px', color: 'var(--ink-2)' }}>
                        {log.operator ? `👤 ${log.operator}` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', width: '150px' }}>
                        {log.ok ? (
                          <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '13px' }}>✓ ผ่าน</span>
                        ) : log.isRescan ? (
                          <span 
                            style={{ 
                              color: '#d97706', 
                              fontWeight: 700, 
                              fontSize: '11px', 
                              background: '#fef3c7', 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              border: '1px solid #fde68a'
                            }} 
                            title={log.msg || "สแกนซ้ำ — สแกนได้ครั้งเดียวและยึดเวลาแรกเสมอ"}
                          >
                            ⚠️ สแกนซ้ำ (เวลาแรก)
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '13px' }}>✗ ไม่พบข้อมูล</span>
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
