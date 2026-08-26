import { useRace } from '../context/RaceContext';

export default function ScanLog() {
  const { scanLog } = useRace();

  const fmtTimeFull = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.toLocaleDateString('th-TH')} ${d.toTimeString().slice(0, 8)}`;
  };

  return (
    <div className="page active">
      <div className="page-head">
        <span className="eyebrow">Audit</span>
        <h1>Scan Log</h1>
        <p>ประวัติการสแกนทั้งหมดทุกจุด เรียงจากล่าสุด — ใช้ตรวจสอบย้อนหลังกรณีมีข้อโต้แย้ง</p>
      </div>
      <div className="card" style={{overflow: 'auto'}}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Station</th>
              <th>BIB</th>
              <th>Name</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {scanLog.map((log, i) => (
              <tr key={i}>
                <td className="mono" style={{color: 'var(--ink-2)'}}>{fmtTimeFull(log.time)}</td>
                <td style={{fontWeight: 500}}>{log.station}</td>
                <td className="mono" style={{fontWeight: 600}}>{log.bib}</td>
                <td>{log.name}</td>
                <td>
                  {log.ok ? 
                    <span style={{color: 'var(--ok)', fontWeight: 600}}>OK</span> : 
                    <span style={{color: 'var(--warn)', fontWeight: 600}}>ERR</span>
                  }
                </td>
                <td style={{color: 'var(--ink-2)', fontSize: '13px'}}>{log.msg || '—'}</td>
              </tr>
            ))}
            {scanLog.length === 0 && <tr><td colSpan="6" className="empty">ยังไม่มีประวัติการสแกน</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="note">💡 เวอร์ชั่นนี้เป็น React แบบออฟไลน์ข้อมูลในหน่วยความจำ (รีเฟรชแล้วข้อมูลกลับเป็นค่าเริ่มต้น)</div>
    </div>
  );
}
