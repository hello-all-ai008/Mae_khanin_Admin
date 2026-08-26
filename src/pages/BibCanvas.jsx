import { useState, useEffect } from 'react';
import CanvasToolbar from '../components/canvas/CanvasToolbar';
import LayerPanel from '../components/canvas/LayerPanel';
import PropertiesPanel from '../components/canvas/PropertiesPanel';
import Workspace from '../components/canvas/Workspace';
import GenerateBibModal from '../components/canvas/GenerateBibModal';
import { supabase } from '../lib/supabaseClient';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X, Download } from 'lucide-react';

export default function BibCanvas() {
  // Use full width of the screen by overriding .main max-width
  useEffect(() => {
    const mainEl = document.querySelector('.main');
    if (mainEl) {
      mainEl.style.maxWidth = 'none';
      mainEl.style.padding = '1rem'; // Reduced padding for canvas editor
    }
    return () => {
      if (mainEl) {
        mainEl.style.maxWidth = '';
        mainEl.style.padding = '';
      }
    };
  }, []);

  // Canvas Settings
  const [dimensions, setDimensions] = useState({ width: 2035, height: 1454 });
  const [zoom, setZoom] = useState(0.4);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // Preview State
  const [previewImage, setPreviewImage] = useState(null);

  // Panel State
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Layers State
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Preview Runner State
  const [previewRunners, setPreviewRunners] = useState([]);
  const [selectedPreviewRunner, setSelectedPreviewRunner] = useState(null);

  useEffect(() => {
    async function fetchPreviewRunners() {
      try {
        const { data: runs } = await supabase.from('runners').select('*').limit(20);
        if (runs && runs.length > 0) {
          setPreviewRunners(runs);
        } else {
          // Provide mock data if no runners in database yet
          setPreviewRunners([
            { id: 'mock-1', name: 'สมชาย ใจดี', bib: '1001' },
            { id: 'mock-2', name: 'วิภา ทิพย์พันธ์', bib: '2050' },
            { id: 'mock-3', name: 'John Doe', bib: '5999' }
          ]);
        }
      } catch (err) {
        console.error('Error fetching preview runners', err);
        // Fallback mock data
        setPreviewRunners([
          { id: 'mock-1', name: 'สมชาย ใจดี', bib: '1001' },
          { id: 'mock-2', name: 'วิภา ทิพย์พันธ์', bib: '2050' }
        ]);
      }
    }
    fetchPreviewRunners();
  }, []);

  // Keyboard Shortcuts (Delete layer)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        setLayers(prev => prev.filter(layer => layer.id !== selectedId));
        setSelectedId(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  const addLayer = (layer) => {
    const newLayers = [...layers, layer];
    setLayers(newLayers);
    setSelectedId(layer.id);
  };

  const updateLayer = (id, newAttrs) => {
    setLayers(layers.map(layer => layer.id === id ? { ...layer, ...newAttrs } : layer));
  };

  const deleteLayer = (id) => {
    setLayers(layers.filter(layer => layer.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const bringToFront = (id) => {
    const layer = layers.find(l => l.id === id);
    const otherLayers = layers.filter(l => l.id !== id);
    setLayers([...otherLayers, layer]);
  };

  const sendToBack = (id) => {
    const layer = layers.find(l => l.id === id);
    const otherLayers = layers.filter(l => l.id !== id);
    setLayers([layer, ...otherLayers]);
  };

  const handleDownloadPreview = () => {
    if (!previewImage) return;
    const link = document.createElement('a');
    link.download = 'bib-canvas-export.png';
    link.href = previewImage;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
      <div className="page-head" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="eyebrow">Design Tools</span>
          <h1 style={{ marginBottom: '4px' }}>BIB Canvas Editor</h1>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>สร้างสรรค์และออกแบบภาพ BIB ได้อย่างอิสระ</p>
        </div>
      </div>

      <CanvasToolbar 
        dimensions={dimensions} 
        setDimensions={setDimensions}
        zoom={zoom}
        setZoom={setZoom}
        layers={layers}
        onGenerate={() => setShowGenerateModal(true)}
      />

      <div style={{ display: 'flex', gap: '1rem', flex: 1, overflow: 'hidden' }}>
        {showLeftPanel && (
          <LayerPanel 
            layers={layers}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            addLayer={addLayer}
            deleteLayer={deleteLayer}
            bringToFront={bringToFront}
            sendToBack={sendToBack}
            previewRunners={previewRunners}
            selectedPreviewRunner={selectedPreviewRunner}
            setSelectedPreviewRunner={setSelectedPreviewRunner}
          />
        )}

        <div style={{ flex: 1, position: 'relative', display: 'flex', minWidth: 0 }}>
          
          <button 
            className="btn" 
            style={{ 
              position: 'absolute', 
              left: '10px', 
              top: '10px', 
              zIndex: 10, 
              padding: '6px', 
              background: '#f8fafc', 
              color: '#0f172a',
              borderColor: '#e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px'
            }}
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            title="Toggle Elements Panel"
          >
            {showLeftPanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <Workspace 
            dimensions={dimensions}
            zoom={zoom}
            setZoom={setZoom}
            stagePos={stagePos}
            setStagePos={setStagePos}
            layers={layers}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            updateLayer={updateLayer}
            onPreview={setPreviewImage}
            previewRunner={selectedPreviewRunner}
          />

          <button 
            className="btn" 
            style={{ 
              position: 'absolute', 
              right: '10px', 
              top: '10px', 
              zIndex: 10, 
              padding: '6px', 
              background: '#f8fafc', 
              color: '#0f172a',
              borderColor: '#e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px'
            }}
            onClick={() => setShowRightPanel(!showRightPanel)}
            title="Toggle Properties Panel"
          >
            {showRightPanel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>

        </div>

        {showRightPanel && (
          <PropertiesPanel 
            layers={layers}
            selectedId={selectedId}
            updateLayer={updateLayer}
          />
        )}
      </div>

      {/* Preview Modal */}
      {previewImage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '2rem', boxSizing: 'border-box'
        }}>
          <button 
            className="btn" 
            style={{ 
              position: 'absolute', top: '24px', right: '24px', 
              background: 'rgba(255, 255, 255, 0.15)', 
              color: 'white', 
              border: 'none',
              borderRadius: '50%',
              width: '40px', height: '40px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
              padding: 0
            }}
            onClick={() => setPreviewImage(null)}
            title="Close Preview"
          >
            <X size={20} />
          </button>

          {previewRunners.length > 0 && (
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', background: 'white', padding: '12px 20px', borderRadius: '8px' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>เลือกข้อมูลนักวิ่งเพื่อดูตัวอย่าง:</span>
              <select 
                className="search" 
                style={{ width: '250px', fontSize: '0.9rem', padding: '8px' }}
                value={selectedPreviewRunner ? selectedPreviewRunner.id : ''}
                onChange={(e) => {
                  const runner = previewRunners.find(r => r.id === e.target.value);
                  setSelectedPreviewRunner(runner || null);
                  // Update preview after a short delay for state to settle
                  setTimeout(() => window.dispatchEvent(new Event('export-canvas')), 100);
                }}
              >
                <option value="">-- ไม่ใช้ข้อมูลนักวิ่ง --</option>
                {previewRunners.map(r => (
                  <option key={r.id} value={r.id}>{r.bib} - {r.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <img 
            src={previewImage} 
            alt="Preview" 
            style={{ maxWidth: '100%', maxHeight: 'calc(100% - 140px)', objectFit: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} 
          />
          
          <button 
            className="btn" 
            style={{ 
              marginTop: '24px', 
              display: 'flex', alignItems: 'center', gap: '8px', 
              fontSize: '15px', fontWeight: 500, 
              padding: '10px 24px',
              background: '#16a34a',
              borderColor: '#16a34a',
              color: 'white'
            }}
            onClick={handleDownloadPreview}
          >
            <Download size={18} /> Download Image
          </button>
        </div>
      )}
      
      {/* Generate Modal */}
      {showGenerateModal && (
        <GenerateBibModal 
          onClose={() => setShowGenerateModal(false)}
          dimensions={dimensions}
          layers={layers}
        />
      )}
    </div>
  );
}
