import React from 'react';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div className="card" style={{
        background: 'var(--bg)',
        width: '400px',
        maxWidth: '90%',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#eab308' }}>⚠️</span> {title}
        </h3>
        <p style={{ margin: '0 0 24px 0', color: 'var(--ink-2)', lineHeight: '1.5' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button 
            className="btn" 
            onClick={onCancel}
            style={{ padding: '8px 16px', background: 'var(--line)', color: 'var(--ink)', border: 'none' }}
          >
            ยกเลิก
          </button>
          <button 
            className="btn" 
            onClick={onConfirm}
            style={{ padding: '8px 16px', background: '#fee2e2', color: '#b91c1c', border: 'none', fontWeight: 600 }}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
