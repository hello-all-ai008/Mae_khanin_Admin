import React from 'react';
import './ESlip.css';
import logoRohnFull from '../LOGO/logo-rohn-full.png';

export default function ESlip({ runner, overallRank, catRank, stations = [] }) {
  if (!runner) return null;

  const fmtTime = (ts) => ts ? new Date(ts).toTimeString().slice(0, 8) : '—';

  const fmtDur = (ms) => {
    if (ms == null) return '—';
    const s = Math.floor(ms / 1e3);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  const printTime = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="eslip" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '12px', right: '16px', fontSize: '9px', color: 'var(--ink-2, #64748b)' }}>
        Printed: {printTime}
      </div>
      <div className="head" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img src={logoRohnFull} alt="ROHN Logo" style={{ height: '90px', width: 'auto', marginBottom: '8px' }} />
        <span style={{ fontSize: '13px' }}>Official e-Slip</span>
      </div>

      <div className="row">
        <span>Name</span>
        <b style={{ textAlign: 'right' }}>{runner.name || '—'}</b>
      </div>
      <div className="row">
        <span>BIB</span>
        <b>{runner.bib || '—'}</b>
      </div>
      <div className="row">
        <span>Category</span>
        <b>{runner.cat || '—'}</b>
      </div>
      <div className="row">
        <span>Gender/Age Group</span>
        <b>{runner.gender || '—'} · {runner.age_group || runner.ageGroup || runner.age || '—'}</b>
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

      {runner.cps && Object.entries(runner.cps).map(([cp, ts]) => {
        const stationName = stations?.find(s => s.id === cp)?.name || cp;
        return (
          <div className="row" key={cp}>
            <span>{stationName}</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{fmtTime(ts)}</span>
          </div>
        );
      })}

      <div className="row">
        <span>Finish</span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtTime(runner.finish)}</span>
      </div>

      <div className="hr"></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0' }}>
        <div style={{ background: 'var(--bg-soft, #f7f8f9)', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--line, #e6e9ed)' }}>
          <div style={{ color: 'var(--ink-2, #64748b)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>Gun Time</div>
          <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--mono)' }}>
            {runner.finish && (runner.gunStartTime || runner.checkin)
              ? fmtDur(runner.finish - (runner.gunStartTime || runner.checkin))
              : '—'}
          </div>
        </div>
        <div style={{ background: 'var(--bg-soft, #f7f8f9)', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--line, #e6e9ed)' }}>
          <div style={{ color: 'var(--ink-2, #64748b)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>Net Time (Start-Finish)</div>
          <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--start, #3b82f6)' }}>
            {runner.finish && runner.cps && Object.keys(runner.cps).length > 0
              ? fmtDur(runner.finish - Math.min(...Object.values(runner.cps))) 
              : '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        <div style={{ flex: 1, background: 'var(--bg-soft, #f7f8f9)', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--ink-2, #64748b)' }}>Overall Rank</div>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>#{overallRank || '—'}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-soft, #f7f8f9)', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--ink-2, #64748b)' }}>Category Rank</div>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>#{catRank || '—'}</div>
        </div>
      </div>

      <div className="foot">Powered by ROHN System</div>
    </div>
  );
}
