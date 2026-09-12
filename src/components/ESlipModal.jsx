import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ESlip from './ESlip';
import { X, Printer } from 'lucide-react';

export default function ESlipModal({ runner, overallRank, catRank, stations = [], runners = [], categories = [], onClose }) {
  // Handle escape key and attach print class to body
  useEffect(() => {
    if (!runner) return;
    document.body.classList.add('has-eslip-modal');

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('has-eslip-modal');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [runner, onClose]);

  // Ensure title is completely empty during print (even if triggered via Ctrl+P)
  useEffect(() => {
    let savedTitle = document.title;
    const handleBefore = () => {
      savedTitle = document.title;
      document.title = '';
    };
    const handleAfter = () => {
      document.title = savedTitle || 'ROHN Runner';
    };
    window.addEventListener('beforeprint', handleBefore);
    window.addEventListener('afterprint', handleAfter);
    return () => {
      window.removeEventListener('beforeprint', handleBefore);
      window.removeEventListener('afterprint', handleAfter);
    };
  }, []);

  if (!runner) return null;

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = '';
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
    }, 1000);
  };

  const modalContent = (
    <div 
      className="modal-bg open eslip-modal-portal" 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '16px', 
        overflowY: 'auto',
        boxSizing: 'border-box'
      }} 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="eslip-modal-card"
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px', 
          alignItems: 'center', 
          width: '100%', 
          maxWidth: '380px',
          margin: 'auto'
        }}
      >
        
        {/* Render the ESlip component */}
        <ESlip runner={runner} overallRank={overallRank} catRank={catRank} stations={stations} runners={runners} categories={categories} />
        
        {/* Actions - hidden when printing */}
        <div style={{ display: 'flex', gap: '10px', width: '100%' }} className="no-print">
          <button 
            type="button"
            style={{ 
              flex: 1, 
              padding: '12px', 
              borderRadius: '10px', 
              background: '#334155', 
              color: '#ffffff', 
              fontSize: '14px', 
              fontWeight: 600, 
              border: 'none', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '6px',
              transition: 'background-color 0.2s'
            }} 
            onClick={onClose}
          >
            <X size={18} /> ปิด (Close)
          </button>
          <button 
            type="button"
            style={{ 
              flex: 1, 
              padding: '12px', 
              borderRadius: '10px', 
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
              color: '#ffffff', 
              fontSize: '14px', 
              fontWeight: 600, 
              border: 'none', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '6px', 
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              transition: 'transform 0.2s'
            }} 
            onClick={handlePrint}
          >
            <Printer size={18} /> พิมพ์ (Print)
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
