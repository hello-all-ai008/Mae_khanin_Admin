import React from 'react';
import './ESlip.css';
import logoBaanPong from '../LOGO/logo-BaanPong.jpg';
import logoMaekhaning from '../LOGO/logo-maekhaning.jpg';
import logoRohn from '../LOGO/logo-rohn-full.png';
import logoRohnLabel from '../LOGO/logo-rohn-label.png';

export default function ESlip({ runner, overallRank, catRank, stations = [] }) {
  if (!runner) return null;

  const fmtTime = (ts) => ts ? new Date(ts).toTimeString().slice(0, 8) : '—';

  const fmtDate = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  };

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

  const parseEpoch = (v, ref) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const s = String(v).trim();
    if (/^\d{10,13}$/.test(s)) return Number(s);
    if (s.includes('-') || s.includes('/')) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    const parts = s.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const baseDate = ref ? new Date(ref) : new Date();
      baseDate.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
      let epoch = baseDate.getTime();
      if (ref && epoch > ref) {
        baseDate.setDate(baseDate.getDate() - 1);
        epoch = baseDate.getTime();
      }
      return epoch;
    }
    return null;
  };

  const finishEpoch = parseEpoch(runner.finish);
  const startEpoch = runner.netTimeMs != null 
    ? (finishEpoch ? finishEpoch - runner.netTimeMs : null)
    : (parseEpoch(runner.gunStartTime, finishEpoch) ||
       parseEpoch(runner.gun_start_time, finishEpoch) ||
       parseEpoch(runner.checkin, finishEpoch) ||
       parseEpoch(runner.checked_in_at, finishEpoch) ||
       (runner.cps && Object.keys(runner.cps).length > 0 ? Math.min(...Object.values(runner.cps).map(v => parseEpoch(v, finishEpoch)).filter(Boolean)) : null));

  const netMs = runner.netTimeMs != null 
    ? runner.netTimeMs 
    : (finishEpoch && startEpoch && finishEpoch > startEpoch ? finishEpoch - startEpoch : null);

  return (
    <div className="eslip" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '12px', right: '16px', fontSize: '9px', color: 'var(--ink-2, #64748b)' }}>
        Printed: {printTime}
      </div>
      <div className="head" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img
          src={logoBaanPong}
          alt="Baan Pong Trail Logo"
          style={{ height: '75px', maxWidth: '180px', width: 'auto', objectFit: 'contain', marginBottom: '8px' }}
        />
        <span style={{ fontSize: '13px', fontWeight: 600 }}>Official e-Slip</span>
      </div>

      <div className="event-name">
        {runner.event_name || 'Baan Pong Trail 2026'}
      </div>

      <div className="bib">
        {runner.bib || '—'}
      </div>

      <div className="name">
        {runner.name || '—'}
      </div>

      <div className="meta">
        <div className="meta-col">
          <div className="meta-label">Category</div>
          <div className="meta-val">{runner.cat || '—'}</div>
        </div>
        <div className="meta-col">
          <div className="meta-label">Gender</div>
          <div className="meta-val">{runner.gender || '—'}</div>
        </div>
        <div className="meta-col">
          <div className="meta-label">Age group</div>
          <div className="meta-val">{runner.age_group || '—'}</div>
        </div>
      </div>

      <div className="hr"></div>

      {stations.map(st => {
        const ts = runner.cps ? runner.cps[st.id] : null;
        return (
          <div className="row" key={st.id}>
            <span>{st.name}</span>
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
          <div style={{ color: 'var(--ink-2, #64748b)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>Start date</div>
          <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)' }}>
            {runner.start_date
              ? fmtDate(runner.start_date)
              : (startEpoch ? fmtDate(startEpoch) : fmtDate(Date.now()))}
          </div>
        </div>
        <div style={{ background: 'var(--bg-soft, #f7f8f9)', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid var(--line, #e6e9ed)' }}>
          <div style={{ color: 'var(--ink-2, #64748b)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '2px' }}>Net Time (Start-Finish)</div>
          <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--start, #3b82f6)' }}>
            {netMs != null ? fmtDur(netMs) : '—'}
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

      <div className="hr" style={{ marginTop: '14px', marginBottom: '12px' }}></div>

      <div className="foot" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <img
            src={logoMaekhaning}
            alt="Mae Khaning Logo"
            style={{ height: '52px', maxWidth: '120px', width: 'auto', objectFit: 'contain', borderRadius: '4px' }}
          />
          <img
            src={logoRohn}
            alt="ROHN Logo"
            style={{ height: '75px', maxWidth: '200px', width: 'auto', objectFit: 'contain' }}
          />
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ink-2, #64748b)', fontWeight: 600 }}>
          <span>Timing System by</span>
          <img 
            src={logoRohnLabel} 
            alt="ROHN" 
            style={{ height: '32px', width: 'auto', objectFit: 'contain' }} 
          />
        </div>
        <span style={{ fontSize: '10px', color: 'var(--ink-2, #64748b)', fontStyle: 'italic' }}>* Provisional Result ( Subject to change)</span>
      </div>
    </div>
  );
}
