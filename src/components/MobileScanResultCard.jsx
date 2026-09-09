import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, User, Clock, Flag, Award } from 'lucide-react';
import { formatEnglishLabel } from './ESlip';

export default function MobileScanResultCard({ 
  runner, 
  message, 
  warn = false, 
  categories = [],
  stationName = "Station"
}) {
  if (!runner) {
    return (
      <div style={{
        background: '#ffffff',
        borderRadius: '14px',
        padding: '16px',
        border: '1px dashed #cbd5e1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        color: '#64748b',
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0284c7'
        }}>
          ⚡
        </div>
        <span>พร้อมรับข้อมูลสแกน — กรอกหมายเลข BIB หรือเปิดกล้อง</span>
      </div>
    );
  }

  const isNotFound = warn && (!runner.name || runner.name === 'NOT FOUND');
  const isDuplicate = !isNotFound && warn;
  const isSuccess = !warn;

  const catObj = categories.find(c => 
    c.id === runner.category_id || 
    c.name === runner.cat || 
    c.name === runner.cat_name
  );
  const catColor = catObj?.color || '#0284c7';

  // Format time of scan if available in message or now
  const timeNow = new Date().toLocaleTimeString('th-TH', { 
    timeZone: 'Asia/Bangkok',
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: `2px solid ${isSuccess ? '#22c55e' : (isDuplicate ? '#f59e0b' : '#ef4444')}`,
      boxShadow: `0 8px 20px -4px ${isSuccess ? 'rgba(34, 197, 94, 0.2)' : (isDuplicate ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)')}`,
      overflow: 'hidden',
      transition: 'all 0.2s ease'
    }}>
      {/* Status Top Ribbon */}
      <div style={{
        padding: '8px 16px',
        background: isSuccess ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : (isDuplicate ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'),
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12.5px',
        fontWeight: 700
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isSuccess && <CheckCircle2 size={16} />}
          {isDuplicate && <AlertTriangle size={16} />}
          {isNotFound && <XCircle size={16} />}
          <span>
            {isSuccess ? `✓ สแกนสำเร็จ (${stationName})` : (isDuplicate ? '⚠️ สแกนซ้ำ (บันทึกเวลาแรก)' : '✗ ไม่พบข้อมูลนักวิ่ง')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', opacity: 0.95 }}>
          <Clock size={13} />
          <span>{timeNow}</span>
        </div>
      </div>

      {/* Main Info Card */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          
          {/* Big BIB Display */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>BIB</span>
            <span style={{
              fontSize: '28px',
              fontWeight: 900,
              color: '#0f172a',
              fontFamily: 'var(--mono)',
              lineHeight: 1
            }}>
              {runner.bib || '—'}
            </span>
          </div>

          {/* Category Pill */}
          {runner.cat && (
            <span style={{
              background: catColor,
              color: '#ffffff',
              padding: '4px 12px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 800,
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
            }}>
              {runner.cat}
            </span>
          )}
        </div>

        {/* Runner Name */}
        <div style={{
          fontSize: '17px',
          fontWeight: 800,
          color: '#1e293b',
          marginTop: '8px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {runner.name ? String(runner.name).toUpperCase() : 'NOT FOUND'}
        </div>

        {/* Meta / Sub details */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '6px',
          fontSize: '12px',
          color: '#64748b',
          flexWrap: 'wrap'
        }}>
          {runner.gender && (
            <span style={{ fontWeight: 600 }}>
              {formatEnglishLabel(runner.gender)}
            </span>
          )}
          {runner.age_group && (
            <span>· {formatEnglishLabel(runner.age_group)}</span>
          )}
          {runner.age && !runner.age_group && (
            <span>· อายุ {runner.age} ปี</span>
          )}
          {runner.nat && (
            <span>· {runner.nat}</span>
          )}
        </div>

        {/* Custom Scan Message if any */}
        {message && (
          <div style={{
            marginTop: '10px',
            padding: '6px 10px',
            borderRadius: '6px',
            background: isSuccess ? '#f0fdf4' : '#fffbeb',
            color: isSuccess ? '#166534' : '#92400e',
            fontSize: '11.5px',
            fontWeight: 600
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
