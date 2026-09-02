import React from 'react';
import ESlip from './ESlip';

export default function ESlipModal({ runner, overallRank, catRank, onClose }) {
  if (!runner) return null;

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', width: '100%', maxWidth: '360px', margin: '0 auto', padding: '0 16px' }}>
        
        {/* Render the ESlip component */}
        <ESlip runner={runner} overallRank={overallRank} catRank={catRank} />
        
        {/* Actions - hidden when printing */}
        <div style={{ display: 'flex', gap: '10px', width: '100%' }} className="no-print">
          <button 
            className="btn btn-dark" 
            style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600 }} 
            onClick={onClose}
          >
            ปิด (Close)
          </button>
          <button 
            className="btn" 
            style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#3b82f6', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none' }} 
            onClick={() => window.print()}
          >
            พิมพ์ (Print)
          </button>
        </div>
      </div>
    </div>
  );
}
