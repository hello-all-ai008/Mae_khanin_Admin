import React from 'react';
import { createPortal } from 'react-dom';
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

  const modalContent = (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        boxSizing: 'border-box',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: 'min(480px, calc(100vw - 24px))',
          minWidth: 0,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.35)',
          border: '1px solid var(--line)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          margin: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-soft)',
          gap: '8px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              background: '#2563eb',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Settings size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: '15px', 
                fontWeight: 800, 
                color: 'var(--ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {title}
              </h3>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--ink-2)', 
                marginTop: '1px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {stationTag}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.06)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--ink)',
              flexShrink: 0
            }}
            title="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ 
          padding: '14px', 
          overflowY: 'auto', 
          overflowX: 'hidden',
          display: 'flex', 
          flexDirection: 'column', 
          gap: '14px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          
          {/* Section 1: Active Event Selector */}
          <div style={{
            background: 'var(--bg-soft)',
            padding: '12px',
            borderRadius: '12px',
            border: '1px solid var(--line)',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: '6px'
            }}>
              <Calendar size={14} color="#2563eb" />
              เลือกงานวิ่ง (Event):
            </label>
            <select
              className="search"
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '13.5px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid var(--line)',
                fontWeight: 600,
                boxSizing: 'border-box'
              }}
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {events.length === 0 && <option value="">ไม่มีงานวิ่งในระบบ</option>}
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '6px', 
              fontSize: '11.5px', 
              color: 'var(--ink-2)',
              flexWrap: 'wrap',
              gap: '4px'
            }}>
              <span>{loadingRunners ? 'กำลังโหลดข้อมูล...' : 'พร้อมใช้งาน'}</span>
              <span style={{ fontWeight: 700, color: '#2563eb' }}>{runners.length} คนในระบบ</span>
            </div>
          </div>

          {/* Section 2: Extra Station-Specific Controls (Monitor, Station CP Selector) */}
          {extraControls && (
            <div style={{
              background: '#f8fafc',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {extraControls}
            </div>
          )}

          {/* Section 3: Operator & Staff Info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: 'var(--bg-soft)',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            fontSize: '12.5px',
            width: '100%',
            boxSizing: 'border-box',
            flexWrap: 'wrap',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={15} color="var(--ink-2)" />
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>เจ้าหน้าที่:</span>
            </div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              👤 {currentOperator || 'Staff'} {currentStaff?.role ? `(${currentStaff.role})` : ''}
            </div>
          </div>

          {/* Section 4: Offline Preload & Data Caching */}
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={14} color="#16a34a" />
              ข้อมูลสำหรับสแกนออฟไลน์ (Offline Mode):
            </div>
            <PreloadDataCard eventId={selectedEventId} />
          </div>

          {/* Section 5: Database Connection & Sync Status */}
          <div style={{
            padding: '10px 12px',
            borderRadius: '10px',
            background: pendingSyncQueue.length > 0 ? (isOnline ? '#eff6ff' : '#fef2f2') : '#f0fdf4',
            border: `1px solid ${pendingSyncQueue.length > 0 ? (isOnline ? '#bfdbfe' : '#fecaca') : '#bbf7d0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            width: '100%',
            boxSizing: 'border-box',
            flexWrap: 'wrap',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, minWidth: 0 }}>
              {pendingSyncQueue.length > 0 ? (
                isOnline ? (
                  <>
                    <RefreshCw size={13} className="spin" color="#2563eb" />
                    <span style={{ color: '#1e40af' }}>ส่ง Database ({pendingSyncQueue.length} รอส่ง)...</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={13} color="#dc2626" />
                    <span style={{ color: '#991b1b' }}>ออฟไลน์: รอส่ง ({pendingSyncQueue.length})</span>
                  </>
                )
              ) : (
                <>
                  <CheckCircle2 size={13} color="#16a34a" />
                  <span style={{ color: '#166534' }}>Database ซิงค์ตรงกัน 100%</span>
                </>
              )}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
              {scanCount} สแกนในเซสชัน
            </span>
          </div>

          {/* Section 6: Clear Recent Log Action */}
          {onClearLog && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', display: 'flex', justifyContent: 'flex-end', width: '100%', boxSizing: 'border-box' }}>
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
                  padding: '7px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={13} /> ล้างประวัติการสแกนบนหน้าจอนี้
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--bg-soft)',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{
              padding: '7px 20px',
              fontSize: '13.5px',
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

  // Render via React Portal directly into document.body to prevent any container clipping
  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
