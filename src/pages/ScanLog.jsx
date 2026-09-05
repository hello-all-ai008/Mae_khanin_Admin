import { useRace } from '../context/RaceContext';
import ScanSyncBadge from '../components/ScanSyncBadge';

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
        <p>ประวัติการสแกนทั้งหมดทุกจุด เรียงจากล่าสุด — พร้อมตรวจสอบสถานะการส่งข้อมูลขึ้น Database</p>
      </div>
      <div className="card" style={{overflow: 'auto'}}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '220px' }}>Time</th>
              <th style={{ width: '190px' }}>Station</th>
              <th style={{ width: '155px' }}>BIB</th>
              <th style={{ minWidth: '260px' }}>Name</th>
              <th style={{ textAlign: 'center', width: '150px' }}>Status</th>
              <th style={{ width: '180px' }}>Note</th>
              <th style={{ textAlign: 'right', width: '210px' }}>Database</th>
            </tr>
          </thead>
          <tbody>
            {scanLog.map((log, i) => (
              <tr key={i}>
                <td className="mono" style={{ width: '220px', color: 'var(--ink-2)' }}>{fmtTimeFull(log.time)}</td>
                <td style={{ width: '190px', fontWeight: 500 }}>{log.station}</td>
                <td className="mono" style={{ width: '155px', fontWeight: 600 }}>{log.bib}</td>
                <td style={{ minWidth: '260px' }}>{log.name}</td>
                <td style={{ textAlign: 'center', width: '150px' }}>
                  {log.ok ? 
                    <span style={{color: 'var(--ok)', fontWeight: 600}}>OK</span> : 
                    <span style={{color: 'var(--warn)', fontWeight: 600}}>ERR</span>
                  }
                </td>
                <td style={{ width: '180px', color: 'var(--ink-2)', fontSize: '13px' }}>{log.msg || '—'}</td>
                <td style={{ textAlign: 'right', width: '210px' }}>
                  <ScanSyncBadge log={log} />
                </td>
              </tr>
            ))}
            {scanLog.length === 0 && <tr><td colSpan="7" className="empty">ยังไม่มีประวัติการสแกน</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="note">💡 ระบบรองรับการทำงานออฟไลน์ เมื่อมีอินเทอร์เน็ตระบบจะส่งข้อมูลไปยัง Database อัตโนมัติ</div>
    </div>
  );
}
