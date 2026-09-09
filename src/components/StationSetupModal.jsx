import React from 'react';
import { X, Settings, Calendar, Database, Trash2, User, RefreshCw, CheckCircle2, WifiOff } from 'lucide-react';
import { useRace } from '../context/RaceContext';
import PreloadDataCard from './PreloadDataCard';

export default function StationSetupModal({
  isOpen,
  onClose,
  title = "การตั้งค่าสถานี",
  stationTag = "Station Setup",
  extraControls = null,
  onClearLog = null,
  scanCount = 0
}) {
  const {
    events,
    selectedEventId,
    setSelectedEventId,
    runners,
    loadingRunners,
    currentOperator,
    currentStaff,
    pendingSyncQueue,
    isOnline
  } = useRace();

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.25)',
          border: '1px solid var(--line)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-soft)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#2563eb',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Settings size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{title}</h3>
              <div style={{ fontSize: '11px', color: 'var(--ink-2)', marginTop: '2px' }}>{stationTag}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.05)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--ink)'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Section 1: Active Event Selector */}
          <div style={{
            background: 'var(--bg-soft)',
            padding: '14px',
            borderRadius: '12px',
            border: '1px solid var(--line)'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: '8px'
            }}>
              <Calendar size={15} color="#2563eb" />
              เลือกงานวิ่ง (Event):
            </label>
            <select
              className="search"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid var(--line)',
                fontWeight: 600
              }}
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {events.length === 0 && <option value="">ไม่มีงานวิ่งในระบบ</option>}
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '12px', color: 'var(--ink-2)' }}>
              <span>สถานะ: {loadingRunners ? 'กำลังโหลดข้อมูล...' : 'พร้อมใช้งาน'}</span>
              <span style={{ fontWeight: 700, color: '#2563eb' }}>{runners.length} คนในระบบ</span>
            </div>
          </div>

          {/* Section 2: Extra Station-Specific Controls (Monitor, Station CP Selector) */}
          {extraControls && (
            <div style={{
              background: '#f8fafc',
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              {extraControls}
            </div>
          )}

          {/* Section 3: Operator & Staff Info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: 'var(--bg-soft)',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            fontSize: '13px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="var(--ink-2)" />
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>เจ้าหน้าที่สแกน:</span>
            </div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              {currentOperator || 'Staff'} {currentStaff?.role ? `(${currentStaff.role})` : ''}
            </div>
          </div>

          {/* Section 4: Offline Preload & Data Caching */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={15} color="#16a34a" />
              เตรียมข้อมูลสำหรับสแกนออฟไลน์ (Offline Mode):
            </div>
            <PreloadDataCard eventId={selectedEventId} />
          </div>

          {/* Section 5: Database Connection & Sync Status */}
          <div style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: pendingSyncQueue.length > 0 ? (isOnline ? '#eff6ff' : '#fef2f2') : '#f0fdf4',
            border: `1px solid ${pendingSyncQueue.length > 0 ? (isOnline ? '#bfdbfe' : '#fecaca') : '#bbf7d0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12.5px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              {pendingSyncQueue.length > 0 ? (
                isOnline ? (
                  <>
                    <RefreshCw size={14} className="spin" color="#2563eb" />
                    <span style={{ color: '#1e40af' }}>กำลังส่ง Database ({pendingSyncQueue.length} รายการ)...</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={14} color="#dc2626" />
                    <span style={{ color: '#991b1b' }}>ออฟไลน์: รอส่ง Database ({pendingSyncQueue.length} รายการ)</span>
                  </>
                )
              ) : (
                <>
                  <CheckCircle2 size={14} color="#16a34a" />
                  <span style={{ color: '#166534' }}>Database ซิงค์ตรงกัน 100%</span>
                </>
              )}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>
              {scanCount} สแกนในเซสชัน
            </span>
          </div>

          {/* Section 6: Clear Recent Log Action */}
          {onClearLog && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  onClearLog();
                  onClose();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#fff',
                  border: '1px solid #fca5a5',
                  color: '#dc2626',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={14} /> ล้างประวัติการสแกนบนหน้าจอนี้
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--bg-soft)'
        }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{
              padding: '8px 24px',
              fontSize: '14px',
              fontWeight: 700,
              borderRadius: '8px'
            }}
          >
            เรียบร้อย
          </button>
        </div>
      </div>
    </div>
  );
}
