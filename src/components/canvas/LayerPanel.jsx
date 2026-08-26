import { Type, Square, Image as ImageIcon, Plus, Trash2, ArrowUp, ArrowDown, QrCode, Barcode } from 'lucide-react';

export default function LayerPanel({ 
  layers, 
  selectedId, 
  setSelectedId, 
  addLayer, 
  deleteLayer, 
  bringToFront, 
  sendToBack,
  previewRunners = [],
  selectedPreviewRunner,
  setSelectedPreviewRunner
}) {

  const handleAddText = () => {
    addLayer({
      id: Date.now().toString(),
      type: 'text',
      text: 'New Text',
      x: 100, y: 100,
      fontSize: 60,
      fontFamily: 'Inter',
      fill: '#000000',
      name: 'Text Layer'
    });
  };

  const handleAddShape = () => {
    addLayer({
      id: Date.now().toString(),
      type: 'rect',
      x: 150, y: 150,
      width: 200, height: 100,
      fill: '#cccccc',
      name: 'Rectangle'
    });
  };

  const handleAddCode = (codeType) => {
    addLayer({
      id: Date.now().toString(),
      type: 'code',
      codeType: codeType, // 'qrcode' or 'barcode'
      text: '123456', // default value
      x: 100, y: 200,
      width: 200, height: codeType === 'qrcode' ? 200 : 100,
      name: codeType === 'qrcode' ? 'QR Code' : 'Barcode'
    });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      addLayer({
        id: Date.now().toString(),
        type: 'image',
        src: url,
        x: 50, y: 50,
        width: img.width, height: img.height,
        name: 'Image Layer',
        brightness: 0,
        keepRatio: true
      });
    };
    img.src = url;
  };

  const handleQuickTag = (tagName) => {
    addLayer({
      id: Date.now().toString(),
      type: 'tag',
      text: tagName,
      x: 200, y: 200,
      width: 150, height: 150,
      fontSize: 50,
      fontFamily: 'Inter',
      fill: '#333333', // Text color (dark gray)
      bgFill: '#FFFFFF', // White background
      stroke: '#888888', // Gray border
      strokeWidth: 4,
      name: `Tag: ${tagName}`
    });
  };

  return (
    <div className="card" style={{ width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Elements
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button className="btn" style={{ padding: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddText}>
            <Type size={14} /> Text
          </button>
          <button className="btn" style={{ padding: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddShape}>
            <Square size={14} /> Shape
          </button>
          
          <button className="btn" style={{ padding: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleAddCode('qrcode')}>
            <QrCode size={14} /> QR Code
          </button>
          <button className="btn" style={{ padding: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleAddCode('barcode')}>
            <Barcode size={14} /> Barcode
          </button>

          <label className="btn" style={{ padding: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', margin: 0, gridColumn: '1 / -1' }}>
            <ImageIcon size={14} /> Upload Image
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
          </label>
        </div>
        
        <h4 style={{ margin: '16px 0 8px 0', fontSize: '0.8rem', color: 'var(--ink-2)' }}>Database Variables</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button className="btn" style={{ padding: '6px', fontSize: '0.75rem', background: 'var(--primary)', color: '#000', fontWeight: 600, border: 'none' }} onClick={() => {
            addLayer({
              id: Date.now().toString(),
              type: 'text',
              text: '{NAME}',
              x: 100, y: 150,
              fontSize: 60,
              fontFamily: 'Inter',
              fill: '#000000',
              fontWeight: 'normal',
              name: 'Name Variable'
            });
          }}>
            👤 ชื่อ-สกุล
          </button>
          <button className="btn" style={{ padding: '6px', fontSize: '0.75rem', background: 'var(--primary)', color: '#000', fontWeight: 600, border: 'none' }} onClick={() => {
            addLayer({
              id: Date.now().toString(),
              type: 'text',
              text: '{BIB}',
              x: 100, y: 250,
              fontSize: 100,
              fontFamily: 'Inter',
              fill: '#000000',
              fontWeight: 'bold',
              name: 'BIB Variable'
            });
          }}>
            🔢 BIB No
          </button>
          <button className="btn" style={{ padding: '6px', fontSize: '0.75rem', background: 'var(--bg-soft)', border: '1px solid var(--border)', color: 'var(--ink)' }} onClick={() => {
            addLayer({
              id: Date.now().toString(), type: 'text', text: '{CAT}', x: 100, y: 350, fontSize: 40, fontFamily: 'Inter', fill: '#000000', name: 'Category Var'
            });
          }}>
            📍 ระยะทาง (CAT)
          </button>
          <button className="btn" style={{ padding: '6px', fontSize: '0.75rem', background: 'var(--bg-soft)', border: '1px solid var(--border)', color: 'var(--ink)' }} onClick={() => {
            addLayer({
              id: Date.now().toString(), type: 'text', text: '{GENDER}', x: 100, y: 400, fontSize: 40, fontFamily: 'Inter', fill: '#000000', name: 'Gender Var'
            });
          }}>
            ⚥ เพศ (GENDER)
          </button>
          <button className="btn" style={{ padding: '6px', fontSize: '0.75rem', background: 'var(--bg-soft)', border: '1px solid var(--border)', color: 'var(--ink)' }} onClick={() => {
            addLayer({
              id: Date.now().toString(), type: 'text', text: '{AGE}', x: 100, y: 450, fontSize: 40, fontFamily: 'Inter', fill: '#000000', name: 'Age Var'
            });
          }}>
            🎂 อายุ (AGE)
          </button>
          <button className="btn" style={{ padding: '6px', fontSize: '0.75rem', background: 'var(--bg-soft)', border: '1px solid var(--border)', color: 'var(--ink)' }} onClick={() => {
            addLayer({
              id: Date.now().toString(), type: 'text', text: '{NAT}', x: 100, y: 500, fontSize: 40, fontFamily: 'Inter', fill: '#000000', name: 'Nationality Var'
            });
          }}>
            🌎 สัญชาติ (NAT)
          </button>
        </div>

        {previewRunners.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--ink-2)', marginBottom: '4px', display: 'block' }}>Preview Runner (Mock)</label>
            <select 
              className="search" 
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }}
              value={selectedPreviewRunner ? selectedPreviewRunner.id : ''}
              onChange={(e) => {
                const runner = previewRunners.find(r => r.id === e.target.value);
                setSelectedPreviewRunner(runner || null);
              }}
            >
              <option value="">-- Template View --</option>
              {previewRunners.map(r => (
                <option key={r.id} value={r.id}>{r.bib} - {r.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginTop: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}>Quick Tags</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {['Start', 'A1', 'A2', 'A3', 'Finish'].map(tag => (
              <button key={tag} className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'var(--bg)', color: 'var(--ink)' }} onClick={() => handleQuickTag(tag)}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>Layers ({layers.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[...layers].reverse().map(layer => (
            <div 
              key={layer.id} 
              style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer',
                background: selectedId === layer.id ? 'var(--primary)' : 'var(--bg-soft)',
                color: selectedId === layer.id ? '#000' : 'var(--ink)'
              }}
              onClick={() => setSelectedId(layer.id)}
            >
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{layer.name || layer.type}</span>
              {selectedId === layer.id && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} onClick={(e) => { e.stopPropagation(); bringToFront(layer.id); }} title="Bring to Front">
                    <ArrowUp size={14} />
                  </button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} onClick={(e) => { e.stopPropagation(); sendToBack(layer.id); }} title="Send to Back">
                    <ArrowDown size={14} />
                  </button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'red' }} onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {layers.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}>No layers added yet.</p>}
        </div>
      </div>
    </div>
  );
}
