import React from 'react';
import ESlip from './ESlip';

export default function ESlipModal({ runner, overallRank, catRank, stations = [], onClose }) {
  if (!runner) return null;

  return (
    <div className="modal-bg open" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflow: 'hidden' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', width: '100%', maxWidth: '340px', transform: 'scale(0.85)', marginTop: '20px' }}>
        
        {/* Render the ESlip component */}
        <ESlip runner={runner} overallRank={overallRank} catRank={catRank} stations={stations} />
        
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
