import { useState, useMemo } from 'react';
import { useRace } from '../context/RaceContext';
import LedBoard from '../components/LedBoard';
import ScannerInput from '../components/ScannerInput';
import PreloadDataCard from '../components/PreloadDataCard';

export default function CheckIn() {
  const { 
    events, 
    selectedEventId, 
    setSelectedEventId, 
    runners, 
    loadingRunners, 
    processScan, 
    scanLog 
  } = useRace();
  const [ledState, setLedState] = useState({ runner: null, message: '', warn: false });

  const handleScan = (bib) => {
    const result = processScan('Check-in', bib);
    
    if (!result.success) {
      setLedState({ 
        runner: result.runner || { bib, name: 'NOT FOUND', nat: '', age: '', cat: '' }, 
        message: result.message, 
        warn: true 
      });
    } else {
      const d = new Date(result.now);
      setLedState({ 
        runner: result.runner, 
        message: `Check in : ${d.toTimeString().slice(0, 8)}`, 
        warn: false 
      });
    }
  };

  const recentLog = useMemo(() => {
    return scanLog.filter(log => log.station === 'Check-in').slice(0, 5);
  }, [scanLog]);

  return (
    <div className="page active">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="station-tag tag-start"><span className="dot"></span>Station · Start</span>
          <h1>Check-in จุดปล่อยตัว</h1>
          <p>ยิงบาร์โค้ดบน BIB หรือพิมพ์หมายเลขแล้วกด Enter — ระบบบันทึกเวลาเช็คอินอัตโนมัติ</p>
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
          <p className="scan-hint">เครื่องยิงบาร์โค้ดจะพิมพ์หมายเลขและกด <span className="kbd">Enter</span> ให้อัตโนมัติ · โฟกัสค้างที่ช่องนี้เสมอ</p>
          
          <div className="card" style={{marginTop: '16px', overflow: 'auto'}}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>เวลา</th>
                  <th style={{ width: '80px' }}>BIB</th>
                  <th>ชื่อนักวิ่ง</th>
                  <th style={{ width: '130px' }}>ผู้สแกน</th>
                  <th style={{ textAlign: 'right', width: '80px' }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {recentLog.map((log, i) => (
                  <tr key={i}>
                    <td className="mono" style={{width: '90px'}}>{new Date(log.time).toTimeString().slice(0,8)}</td>
                    <td className="mono" style={{fontWeight: 600}}>{log.bib}</td>
                    <td>{log.name}</td>
                    <td style={{ fontSize: '12px', color: 'var(--ink-2)' }}>
                      {log.operator ? `👤 ${log.operator}` : '—'}
                    </td>
                    <td style={{textAlign: 'right'}}>
                      {log.ok ? <span style={{color: 'var(--ok)'}}>✓</span> : <span style={{color: 'var(--warn)'}}>✗ {log.msg}</span>}
                    </td>
                  </tr>
                ))}
                {recentLog.length === 0 && <tr><td colSpan="5" className="empty">ยังไม่มีการสแกน</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        
        <LedBoard runner={ledState.runner} message={ledState.message} warn={ledState.warn} />
      </div>
    </div>
  );
}
