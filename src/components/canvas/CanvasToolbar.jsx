import { Download, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { jsPDF } from 'jspdf';

export default function CanvasToolbar({ dimensions, setDimensions, zoom, setZoom, layers, onGenerate }) {
  
  const handleWidthChange = (e) => {
    setDimensions(prev => ({ ...prev, width: Number(e.target.value) || 2035 }));
  };

  const handleHeightChange = (e) => {
    setDimensions(prev => ({ ...prev, height: Number(e.target.value) || 1454 }));
  };

  const handleExport = async () => {
    // Basic export logic: find the stage and export it.
    // In Konva, we can get the stage data URL, but since we are not directly inside the Stage here,
    // we will rely on a global trigger or ref. For now, we will dispatch a custom event.
    window.dispatchEvent(new Event('export-canvas'));
  };

  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>Canvas Size:</label>
          <input 
            type="number" 
            className="search" 
            style={{ width: '80px', padding: '6px' }} 
            value={dimensions.width} 
            onChange={handleWidthChange} 
          />
          <span style={{ color: 'var(--ink-2)' }}>×</span>
          <input 
            type="number" 
            className="search" 
            style={{ width: '80px', padding: '6px' }} 
            value={dimensions.height} 
            onChange={handleHeightChange} 
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: '4px' }}>px</span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn" style={{ padding: '6px', background: 'transparent', color: 'var(--ink)' }} onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>
            <ZoomOut size={16} />
          </button>
          <span style={{ fontSize: '0.85rem', width: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="btn" style={{ padding: '6px', background: 'transparent', color: 'var(--ink)' }} onClick={() => setZoom(z => Math.min(3, z + 0.1))}>
            <ZoomIn size={16} />
          </button>
          <button className="btn" style={{ padding: '6px 12px', background: 'var(--bg-soft)', fontSize: '0.8rem', color: 'var(--ink)' }} onClick={() => setZoom(1)}>
            Reset Zoom
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn" style={{ background: 'var(--primary)', color: '#000', padding: '6px 16px', fontWeight: 600 }} onClick={onGenerate}>
          <Download size={16} style={{ marginRight: '6px' }} />
          Generate BIBs
        </button>
        <button 
          className="btn" 
          style={{ background: 'var(--primary)', color: '#000', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          onClick={handleExport}
        >
          <Download size={16} /> Preview
        </button>
      </div>
    </div>
  );
}
