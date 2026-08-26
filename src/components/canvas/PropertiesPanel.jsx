import { Settings2 } from 'lucide-react';

export default function PropertiesPanel({ layers, selectedId, updateLayer }) {
  const selectedLayer = layers.find(l => l.id === selectedId);

  if (!selectedLayer) {
    return (
      <div className="card" style={{ width: '250px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', textAlign: 'center', fontSize: '0.85rem' }}>
        Select a layer to edit properties
      </div>
    );
  }

  const handleChange = (e, field) => {
    let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (e.target.type === 'number') val = Number(val);
    updateLayer(selectedLayer.id, { [field]: val });
  };

  return (
    <div className="card" style={{ width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Settings2 size={16} /> Properties
        </h3>
      </div>
      
      <div style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        {/* Common Properties */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>X Position</label>
            <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.x)} onChange={(e) => handleChange(e, 'x')} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Y Position</label>
            <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.y)} onChange={(e) => handleChange(e, 'y')} />
          </div>
        </div>

        {/* Text Properties */}
        {selectedLayer.type === 'text' && (
          <>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Text</label>
              <input type="text" className="search" style={{ width: '100%', padding: '4px' }} value={selectedLayer.text} onChange={(e) => handleChange(e, 'text')} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Font Size (px)</label>
              <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={selectedLayer.fontSize} onChange={(e) => handleChange(e, 'fontSize')} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Font Family</label>
              <select className="search" style={{ width: '100%', padding: '4px' }} value={selectedLayer.fontFamily} onChange={(e) => handleChange(e, 'fontFamily')}>
                <option value="Inter">Inter</option>
                <option value="Prompt">Prompt</option>
                <option value="Kanit">Kanit</option>
                <option value="Sarabun">Sarabun</option>
                <option value="IBM Plex Sans Thai">IBM Plex Sans Thai</option>
                <option value="sans-serif">Sans-Serif</option>
                <option value="serif">Serif</option>
                <option value="monospace">Monospace</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Color</label>
              <input type="color" style={{ width: '100%', height: '32px', border: '1px solid var(--border)', borderRadius: '4px' }} value={selectedLayer.fill} onChange={(e) => handleChange(e, 'fill')} />
            </div>
          </>
        )}

        {/* Tag Properties */}
        {selectedLayer.type === 'tag' && (
          <>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Text</label>
              <input type="text" className="search" style={{ width: '100%', padding: '4px' }} value={selectedLayer.text} onChange={(e) => handleChange(e, 'text')} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Box Width</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.width || 200)} onChange={(e) => handleChange(e, 'width')} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Box Height</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.height || 100)} onChange={(e) => handleChange(e, 'height')} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Font Size (px)</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={selectedLayer.fontSize} onChange={(e) => handleChange(e, 'fontSize')} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Font Family</label>
                <select className="search" style={{ width: '100%', padding: '4px' }} value={selectedLayer.fontFamily} onChange={(e) => handleChange(e, 'fontFamily')}>
                  <option value="Inter">Inter</option>
                  <option value="Prompt">Prompt</option>
                  <option value="Kanit">Kanit</option>
                  <option value="Sarabun">Sarabun</option>
                  <option value="IBM Plex Sans Thai">IBM Plex Sans Thai</option>
                  <option value="sans-serif">Sans-Serif</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Text Color</label>
                <input type="color" style={{ width: '100%', height: '32px', border: '1px solid var(--border)', borderRadius: '4px' }} value={selectedLayer.fill} onChange={(e) => handleChange(e, 'fill')} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Box Color</label>
                <input type="color" style={{ width: '100%', height: '32px', border: '1px solid var(--border)', borderRadius: '4px' }} value={selectedLayer.bgFill || '#ffcc00'} onChange={(e) => handleChange(e, 'bgFill')} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Border Color</label>
              <input type="color" style={{ width: '100%', height: '32px', border: '1px solid var(--border)', borderRadius: '4px' }} value={selectedLayer.stroke || '#888888'} onChange={(e) => handleChange(e, 'stroke')} />
            </div>
          </>
        )}

        {/* Shape Properties */}
        {selectedLayer.type === 'rect' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Width</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.width)} onChange={(e) => handleChange(e, 'width')} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Height</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.height)} onChange={(e) => handleChange(e, 'height')} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Color</label>
              <input type="color" style={{ width: '100%', height: '32px', border: '1px solid var(--border)', borderRadius: '4px' }} value={selectedLayer.fill} onChange={(e) => handleChange(e, 'fill')} />
            </div>
          </>
        )}

        {/* Image Properties */}
        {selectedLayer.type === 'image' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Width</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.width)} onChange={(e) => handleChange(e, 'width')} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Height</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.height)} onChange={(e) => handleChange(e, 'height')} />
              </div>
            </div>
            
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="checkbox" 
                id="keepRatio" 
                checked={selectedLayer.keepRatio !== false} 
                onChange={(e) => updateLayer(selectedLayer.id, { keepRatio: e.target.checked })} 
              />
              <label htmlFor="keepRatio" style={{ fontSize: '0.85rem', color: 'var(--ink)', cursor: 'pointer' }}>คงสัดส่วนรูปภาพ (Auto Size)</label>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Brightness ({-1} to 1)</label>
              <input type="range" min="-1" max="1" step="0.05" style={{ width: '100%' }} value={selectedLayer.brightness || 0} onChange={(e) => handleChange(e, 'brightness')} />
            </div>
          </>
        )}

        {/* Code Properties (QR/Barcode) */}
        {selectedLayer.type === 'code' && (
          <>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Code Data (Text)</label>
              <input type="text" className="search" style={{ width: '100%', padding: '4px' }} value={selectedLayer.text} onChange={(e) => handleChange(e, 'text')} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Width</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.width)} onChange={(e) => handleChange(e, 'width')} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Height</label>
                <input type="number" className="search" style={{ width: '100%', padding: '4px' }} value={Math.round(selectedLayer.height)} onChange={(e) => handleChange(e, 'height')} />
              </div>
            </div>
            {selectedLayer.codeType === 'barcode' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input type="checkbox" id="showText" checked={selectedLayer.showText !== false} onChange={(e) => handleChange(e, 'showText')} />
                <label htmlFor="showText" style={{ fontSize: '0.75rem', cursor: 'pointer', margin: 0 }}>Show text below barcode</label>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
