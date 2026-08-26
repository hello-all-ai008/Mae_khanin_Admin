import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { jsPDF } from 'jspdf';
import { X, Download, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

export default function GenerateBibModal({ onClose, dimensions, layers }) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('');
  
  const [runners, setRunners] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  // Fetch events
  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase.from('events').select('id, name').order('start_date', { ascending: false });
      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
    }
    fetchEvents();
  }, []);

  // Fetch categories and runners when event changes
  useEffect(() => {
    if (!selectedEventId) return;
    async function fetchData() {
      const { data: catData } = await supabase.from('categories').select('name').eq('event_id', selectedEventId);
      if (catData) setCategories(catData.map(c => c.name));
      
      const { data: runData } = await supabase.from('runners').select('*').eq('event_id', selectedEventId);
      if (runData) setRunners(runData);
    }
    fetchData();
  }, [selectedEventId]);

  const filteredRunners = runners.filter(r => !selectedCat || r.cat === selectedCat);

  const generatePDF = async () => {
    if (filteredRunners.length === 0) return;
    setIsGenerating(true);
    setProgress(0);
    setMessage('กำลังเตรียมไฟล์รูปภาพ...');

    // Pre-load all image layers
    const preloadedImages = {};
    for (const layer of layers) {
      if (layer.type === 'image') {
        preloadedImages[layer.id] = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = layer.src;
        });
      }
    }

    setMessage('กำลังสร้าง PDF...');
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    
    const orientation = dimensions.width > dimensions.height ? 'l' : 'p';
    const pdf = new jsPDF({ orientation, unit: 'px', format: [dimensions.width, dimensions.height], compress: true });

    for (let i = 0; i < filteredRunners.length; i++) {
      const r = filteredRunners[i];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background white
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const layer of layers) {
        if (layer.type === 'image') {
          const img = preloadedImages[layer.id];
          if (img) {
            ctx.save();
            if (layer.brightness !== undefined && layer.brightness !== 0) {
              const b = 100 + (layer.brightness * 100); // roughly map -1 to 1 into 0% to 200%
              ctx.filter = `brightness(${b}%)`;
            }
            ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
            ctx.restore();
          }
        } 
        else if (layer.type === 'shape') {
          ctx.save();
          ctx.fillStyle = layer.fill;
          if (layer.stroke) {
            ctx.strokeStyle = layer.stroke;
            ctx.lineWidth = layer.strokeWidth || 1;
          }
          ctx.beginPath();
          if (layer.cornerRadius) {
            ctx.roundRect(layer.x, layer.y, layer.width, layer.height, layer.cornerRadius);
          } else {
            ctx.rect(layer.x, layer.y, layer.width, layer.height);
          }
          ctx.fill();
          if (layer.stroke) ctx.stroke();
          ctx.restore();
        }
        else if (layer.type === 'text') {
          let text = layer.text || '';
          text = text
            .replace(/{NAME}/g, r.name || '')
            .replace(/{BIB}/g, r.bib || '')
            .replace(/{CAT}/g, r.cat || '')
            .replace(/{GENDER}/g, r.gender || '')
            .replace(/{AGE}/g, r.age || '')
            .replace(/{NAT}/g, r.nat || '');
          
          ctx.save();
          ctx.textBaseline = 'top';
          ctx.font = `${layer.fontWeight || 'normal'} ${layer.fontSize}px ${layer.fontFamily || 'Inter'}`;
          ctx.fillStyle = layer.fill || '#000000';
          // Approximate centering if align is center
          if (layer.align === 'center') {
            ctx.textAlign = 'center';
            ctx.fillText(text, layer.x + (layer.width || 0)/2, layer.y);
          } else if (layer.align === 'right') {
            ctx.textAlign = 'right';
            ctx.fillText(text, layer.x + (layer.width || 0), layer.y);
          } else {
            ctx.textAlign = 'left';
            ctx.fillText(text, layer.x, layer.y);
          }
          ctx.restore();
        }
        else if (layer.type === 'code') {
          let text = layer.text || '';
          text = text
            .replace(/{NAME}/g, r.name || '')
            .replace(/{BIB}/g, r.bib || '')
            .replace(/{CAT}/g, r.cat || '')
            .replace(/{GENDER}/g, r.gender || '')
            .replace(/{AGE}/g, r.age || '')
            .replace(/{NAT}/g, r.nat || '');
          
          if (layer.codeType === 'qrcode') {
            try {
              const qrUrl = await QRCode.toDataURL(text, { margin: 1, width: layer.width });
              const qrImg = new Image(); qrImg.src = qrUrl;
              await new Promise(res => { qrImg.onload = res });
              ctx.drawImage(qrImg, layer.x, layer.y, layer.width, layer.height);
            } catch(e) { console.error(e) }
          } else if (layer.codeType === 'barcode') {
            try {
              const bc = document.createElement('canvas');
              JsBarcode(bc, text, { margin: 0, displayValue: layer.showText !== false, height: 100, width: 2 });
              ctx.drawImage(bc, layer.x, layer.y, layer.width, layer.height);
            } catch(e) { console.error(e) }
          }
        }
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      if (i > 0) pdf.addPage([dimensions.width, dimensions.height], orientation);
      pdf.addImage(imgData, 'JPEG', 0, 0, dimensions.width, dimensions.height);
      
      setProgress(Math.round(((i + 1) / filteredRunners.length) * 100));
      await new Promise(resolve => setTimeout(resolve, 5)); // yield
    }

    setMessage('กำลังบันทึกไฟล์...');
    pdf.save("Auto_BIBs.pdf");
    setIsGenerating(false);
    setMessage('');
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="card" style={{ width: '500px', padding: '24px', position: 'relative' }}>
        <button className="btn" style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent' }} onClick={onClose} disabled={isGenerating}>
          <X size={20} />
        </button>
        
        <h2 style={{ margin: '0 0 20px 0' }}>Generate Auto BIBs</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Select Event</label>
          <select className="search" style={{ width: '100%' }} value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} disabled={isGenerating}>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Select Category</label>
          <select className="search" style={{ width: '100%' }} value={selectedCat} onChange={e => setSelectedCat(e.target.value)} disabled={isGenerating}>
            <option value="">ทั้งหมด (All)</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ padding: '16px', background: 'var(--bg-soft)', borderRadius: '8px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Runners Found:</span>
            <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{filteredRunners.length}</span>
          </div>
        </div>

        {isGenerating ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Loader2 size={32} className="spin" style={{ margin: '0 auto 16px auto', color: 'var(--primary)' }} />
            <p style={{ margin: '0 0 8px 0' }}>{message}</p>
            <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }}></div>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--ink-2)' }}>{progress}%</p>
          </div>
        ) : (
          <button 
            className="btn" 
            style={{ width: '100%', padding: '12px', background: 'var(--primary)', color: '#000', fontWeight: 'bold', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            onClick={generatePDF}
            disabled={filteredRunners.length === 0}
          >
            <Download size={20} /> Generate PDF
          </button>
        )}
      </div>
    </div>
  );
}
