import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Sparkles } from 'lucide-react';
import { formatEnglishLabel } from './ESlip';

/**
 * MobileScanResultCard — ช่องบอกรายละเอียดนักวิ่งเหมือนหน้า PC สำหรับหน้าจอโทรศัพท์ (Phone UI)
 * แสดงผลแบบ LED Board สีเข้ม สไตล์ Race Timing กลางแจ้ง เห็นชัดเจน พร้อมกรอบสแกนเนอร์
 */
export default function MobileScanResultCard({ 
  runner, 
  message, 
  warn = false, 
  categories = [],
  stationName = "Station"
}) {
  const isNotFound = warn && (!runner?.name || runner.name === 'NOT FOUND');
  const isDuplicate = !isNotFound && warn;
  const isSuccess = !warn && !!runner;

  const catObj = categories.find(c => 
    c.id === runner?.category_id || 
    c.name === runner?.cat || 
    c.name === runner?.cat_name
  );
  const catColor = catObj?.color || '#3b82f6';

  // Format time of scan
  const timeNow = new Date().toLocaleTimeString('th-TH', { 
    timeZone: 'Asia/Bangkok',
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });

  return (
    <div style={{ marginTop: '10px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Label Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: '6px',
        padding: '0 4px'
      }}>
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 700, 
          letterSpacing: '0.06em', 
          textTransform: 'uppercase', 
          color: 'var(--ink-2)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <Sparkles size={13} color="#8b2df6" />
          ช่องแสดงรายละเอียดนักวิ่ง (LED Board)
        </span>
        {runner && (
          <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'var(--mono)' }}>
            สแกนล่าสุด: {timeNow}
          </span>
        )}
      </div>

      {/* Dark LED Board Box (Replicating PC .led Board for Phone UI) */}
      <div 
        className={`led ${warn ? 'flash-warn' : (runner ? 'flash-ok' : '')}`}
        style={{
          background: 'radial-gradient(ellipse at center, #1e293b 0%, #0b0f19 100%)',
          borderRadius: '14px',
          padding: runner ? '14px 12px' : '20px 12px',
          minHeight: runner ? '150px' : '105px',
          border: `1.5px solid ${runner ? (isSuccess ? '#22c55e' : (isDuplicate ? '#f59e0b' : '#ef4444')) : '#1e293b'}`,
          boxShadow: runner 
            ? `0 8px 24px -4px ${isSuccess ? 'rgba(34, 197, 94, 0.25)' : (isDuplicate ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)')}`
            : '0 4px 14px rgba(0,0,0,0.1)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '5px',
          width: '100%',
          boxSizing: 'border-box',
          transition: 'all 0.25s ease'
        }}
      >
        {/* Subtle Scanline CRT Pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,0.02) 3px 4px)',
          pointerEvents: 'none'
        }} />

        {runner ? (
          <>
            {/* Status Pill Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 10px',
              borderRadius: '99px',
              fontSize: '11px',
              fontWeight: 700,
              background: isSuccess ? 'rgba(34, 197, 94, 0.18)' : (isDuplicate ? 'rgba(245, 158, 11, 0.18)' : 'rgba(239, 68, 68, 0.18)'),
              color: isSuccess ? '#4ade80' : (isDuplicate ? '#fbbf24' : '#f87171'),
              border: `1px solid ${isSuccess ? 'rgba(74, 222, 128, 0.35)' : (isDuplicate ? 'rgba(251, 191, 36, 0.35)' : 'rgba(248, 113, 113, 0.35)')}`,
              marginBottom: '2px',
              zIndex: 1
            }}>
              {isSuccess && <CheckCircle2 size={13} />}
              {isDuplicate && <AlertTriangle size={13} />}
              {isNotFound && <XCircle size={13} />}
              <span>
                {isSuccess ? `✓ สแกนสำเร็จ (${stationName})` : (isDuplicate ? '⚠️ สแกนซ้ำ (ยึดเวลาแรก)' : '✗ ไม่พบข้อมูลนักวิ่ง')}
              </span>
            </div>

            {/* BIB Number (Big glowing monospace) */}
            <div 
              className="bib"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '40px',
                fontWeight: 900,
                color: '#ffffff',
                lineHeight: 1,
                letterSpacing: '0.06em',
                textShadow: isSuccess 
                  ? '0 0 16px rgba(34, 197, 94, 0.5)' 
                  : (isDuplicate ? '0 0 16px rgba(245, 158, 11, 0.5)' : '0 0 16px rgba(239, 68, 68, 0.5)'),
                zIndex: 1
              }}
            >
              {String(runner.bib ?? '—')}
            </div>

            {/* Runner Full Name */}
            <div 
              className="name"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#f8fafc',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                maxWidth: '96%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
                zIndex: 1
              }}
            >
              {runner.name ? String(runner.name).toUpperCase() : 'NOT FOUND'}
            </div>

            {/* Meta Row: Category Pill + Gender + Age + Nationality */}
            <div 
              className="meta"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                marginTop: '2px',
                zIndex: 1
              }}
            >
              {runner.cat && (
                <span style={{
                  background: catColor,
                  color: '#ffffff',
                  padding: '2px 9px',
                  borderRadius: '99px',
                  fontSize: '11px',
                  fontWeight: 800,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                }}>
                  {runner.cat}
                </span>
              )}
              {runner.gender && (
                <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>
                  {formatEnglishLabel(runner.gender)}
                </span>
              )}
              {(runner.age_group || runner.age) && (
                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  · {runner.age_group ? formatEnglishLabel(runner.age_group) : `${runner.age} ปี`}
                </span>
              )}
              {runner.nat && (
                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  · {runner.nat}
                </span>
              )}
            </div>

            {/* Time / Scan Message */}
            {message && (
              <div 
                className={`time ${warn ? 'meta-warn' : ''}`}
                style={{
                  fontSize: '13px',
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  marginTop: '4px',
                  color: isSuccess ? '#86efac' : (isDuplicate ? '#fde68a' : '#fca5a5'),
                  zIndex: 1
                }}
              >
                {String(message)}
              </div>
            )}
          </>
        ) : (
          /* Idle State (Signature PC LED Style) */
          <div style={{ zIndex: 1 }}>
            <div 
              className="idle"
              style={{
                fontSize: '18px',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                color: '#38bdf8',
                letterSpacing: '0.08em',
                opacity: 0.9,
                textShadow: '0 0 12px rgba(56, 189, 248, 0.4)'
              }}
            >
              — รอการสแกน —
            </div>
            <div style={{
              fontSize: '11.5px',
              color: '#64748b',
              marginTop: '4px',
              fontWeight: 500
            }}>
              พิมพ์หมายเลข BIB หรือเปิดกล้องเพื่อสแกน
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
