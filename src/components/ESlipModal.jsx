export default function ESlipModal({ runner, overallRank, catRank, onClose }) {
  const fmtTime = (ts) => ts ? new Date(ts).toTimeString().slice(0, 8) : '—';
  const fmtDur = (ms) => {
    if (ms == null) return '—';
    const s = Math.floor(ms / 1e3);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  return (
    <div className="modal-bg open" onClick={(e) => { if(e.target === e.currentTarget) onClose() }}>
      <div className="eslip">
        <div className="head">
          <div className="logo-mark" style={{margin: '0 auto 8px'}}>TT</div>
          <b>TrailTime</b><br/>Official e-Slip
        </div>
        
        <div className="row">
          <span>Name</span>
          <b style={{textAlign: 'right'}}>{runner.name}</b>
        </div>
        <div className="row">
          <span>BIB</span>
          <b>{runner.bib}</b>
        </div>
        <div className="row">
          <span>Category</span>
          <b>{runner.cat}</b>
        </div>
        <div className="row">
          <span>Gender/Age</span>
          <b>{runner.gender} · {runner.age}</b>
        </div>
        
        <div className="hr"></div>
        
        <div className="row">
          <span>Official Gun Start</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{runner.categoryStartTimeStr || fmtTime(runner.gunStartTime) || '—'}</span>
        </div>
        <div className="row">
          <span>Check-in Scan</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{fmtTime(runner.checkin)}</span>
        </div>
        {runner.cps && Object.entries(runner.cps).map(([cp, ts]) => (
          <div className="row" key={cp}>
            <span>{cp}</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{fmtTime(ts)}</span>
          </div>
        ))}
        <div className="row">
          <span>Finish</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtTime(runner.finish)}</span>
        </div>
        
        <div className="hr"></div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0' }}>
          <div style={{ background: 'var(--bg-soft)', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--ink-2)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>Gun Time (Official)</div>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)' }}>
              {runner.finish && (runner.gunStartTime || runner.checkin) 
                ? fmtDur(runner.finish - (runner.gunStartTime || runner.checkin)) 
                : '—'}
            </div>
          </div>
          <div style={{ background: 'var(--bg-soft)', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--ink-2)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>Chip Time (Net)</div>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--start)' }}>
              {runner.finish && runner.checkin ? fmtDur(runner.finish - runner.checkin) : '—'}
            </div>
          </div>
        </div>
        
        <div style={{display: 'flex', gap: '10px', marginTop: '6px'}}>
          <div style={{flex: 1, background: 'var(--bg-soft)', padding: '10px', borderRadius: '10px', textAlign: 'center'}}>
            <div style={{fontSize: '11px', color: 'var(--ink-2)'}}>Overall Rank</div>
            <div style={{fontSize: '18px', fontWeight: 600}}>#{overallRank}</div>
          </div>
          <div style={{flex: 1, background: 'var(--bg-soft)', padding: '10px', borderRadius: '10px', textAlign: 'center'}}>
            <div style={{fontSize: '11px', color: 'var(--ink-2)'}}>Category Rank</div>
            <div style={{fontSize: '18px', fontWeight: 600}}>#{catRank}</div>
          </div>
        </div>
        
        <div className="foot">Powered by TrailTime System</div>
        
        <div className="actions">
          <button className="btn btn-dark" style={{width: '100%'}} onClick={onClose}>ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  );
}
