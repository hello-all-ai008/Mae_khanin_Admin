import { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  ScanLine, 
  X, 
  RefreshCcw, 
  ZoomIn, 
  ZoomOut, 
  Flashlight, 
  FlashlightOff, 
  QrCode, 
  Barcode, 
  Maximize2, 
  Minimize2,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  UserCheck
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useRace } from '../context/RaceContext';

export default function ScannerInput({ onScan }) {
  const { currentOperator, currentStaff, runners, lastSyncedTime } = useRace();
  const [bibInput, setBibInput] = useState('');
  
  // Camera State
  const [showCamera, setShowCamera] = useState(() => {
    return localStorage.getItem('trail_camera_active') === 'true';
  });
  const [facingMode, setFacingMode] = useState(() => {
    return localStorage.getItem('trail_camera_facing') || 'environment';
  });
  
  // Focus & Scanning Mode: 'barcode' (1D wide), 'qr' (2D square), 'wide' (wide auto)
  const [scanMode, setScanMode] = useState(() => {
    return localStorage.getItem('trail_camera_scan_mode') || 'barcode';
  });

  // View Size: 'standard' | 'compact' | 'large'
  const [viewSize, setViewSize] = useState(() => {
    return localStorage.getItem('trail_camera_view_size') || 'standard';
  });

  // Aspect Ratio: '16:9' | '4:3' | '1:1'
  const [aspectRatioMode, setAspectRatioMode] = useState(() => {
    return localStorage.getItem('trail_camera_aspect_ratio') || '16:9';
  });

  // Zoom Level (1x - 3.5x)
  const [zoomLevel, setZoomLevel] = useState(1);
  const [supportsHardwareZoom, setSupportsHardwareZoom] = useState(false);
  const [minHardwareZoom, setMinHardwareZoom] = useState(1);
  const [maxHardwareZoom, setMaxHardwareZoom] = useState(3);

  // Torch / Flashlight
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);

  // Sound Feedback
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Advanced Controls Collapse
  const [showControls, setShowControls] = useState(true);

  const html5QrCodeRef = useRef(null);
  const lastScanned = useRef('');
  const isScanningRef = useRef(false);
  const audioCtxRef = useRef(null);

  // Save persistent preferences
  useEffect(() => {
    localStorage.setItem('trail_camera_active', showCamera);
  }, [showCamera]);

  useEffect(() => {
    localStorage.setItem('trail_camera_facing', facingMode);
  }, [facingMode]);

  useEffect(() => {
    localStorage.setItem('trail_camera_scan_mode', scanMode);
  }, [scanMode]);

  useEffect(() => {
    localStorage.setItem('trail_camera_view_size', viewSize);
  }, [viewSize]);

  useEffect(() => {
    localStorage.setItem('trail_camera_aspect_ratio', aspectRatioMode);
  }, [aspectRatioMode]);

  // Play pleasant beep sound using Web Audio API
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio feedback error:', e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && bibInput.trim()) {
      playBeep();
      onScan(bibInput.trim());
      setBibInput('');
    }
  };

  // Helper to inspect active video track capabilities
  const inspectTrackCapabilities = () => {
    try {
      const videoElem = document.querySelector('#qr-reader video');
      if (videoElem && videoElem.srcObject) {
        const tracks = videoElem.srcObject.getVideoTracks();
        if (tracks && tracks.length > 0) {
          const track = tracks[0];
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          
          if (capabilities.zoom) {
            setSupportsHardwareZoom(true);
            setMinHardwareZoom(capabilities.zoom.min || 1);
            setMaxHardwareZoom(capabilities.zoom.max || 5);
          } else {
            setSupportsHardwareZoom(false);
          }

          if (capabilities.torch) {
            setSupportsTorch(true);
          } else {
            setSupportsTorch(false);
          }
          return track;
        }
      }
    } catch (err) {
      console.warn('Track inspection error:', err);
    }
    return null;
  };

  // Apply zoom constraint or fallback to CSS scale
  const applyZoom = async (newZoom) => {
    setZoomLevel(newZoom);
    try {
      const videoElem = document.querySelector('#qr-reader video');
      if (videoElem && videoElem.srcObject) {
        const tracks = videoElem.srcObject.getVideoTracks();
        if (tracks && tracks.length > 0) {
          const track = tracks[0];
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          if (capabilities.zoom) {
            const clamped = Math.min(Math.max(newZoom, capabilities.zoom.min || 1), capabilities.zoom.max || 5);
            await track.applyConstraints({ advanced: [{ zoom: clamped }] });
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Hardware zoom not supported or failed, using CSS scale:', err);
    }

    // CSS scaling fallback on video element
    const videoElem = document.querySelector('#qr-reader video');
    if (videoElem) {
      videoElem.style.transform = newZoom > 1 ? `scale(${newZoom})` : 'none';
      videoElem.style.transformOrigin = 'center center';
      videoElem.style.transition = 'transform 0.2s ease-out';
    }
  };

  // Apply Torch / Flashlight
  const toggleTorch = async () => {
    const nextState = !isTorchOn;
    setIsTorchOn(nextState);
    try {
      const videoElem = document.querySelector('#qr-reader video');
      if (videoElem && videoElem.srcObject) {
        const tracks = videoElem.srcObject.getVideoTracks();
        if (tracks && tracks.length > 0) {
          const track = tracks[0];
          await track.applyConstraints({ advanced: [{ torch: nextState }] });
        }
      }
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const getScanBox = (viewfinderWidth, viewfinderHeight) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    
    if (scanMode === 'barcode') {
      // 1D Barcode: Wide horizontal rectangular box (Code 128 / Code 39)
      const width = Math.min(Math.floor(viewfinderWidth * 0.9), 420);
      const height = Math.min(Math.floor(viewfinderHeight * 0.35), 130);
      return { width: Math.max(width, 240), height: Math.max(height, 80) };
    } else if (scanMode === 'qr') {
      // 2D QR Code: Square box
      const edge = Math.min(Math.floor(minEdge * 0.72), 300);
      return { width: Math.max(edge, 180), height: Math.max(edge, 180) };
    } else {
      // Wide / Auto: Large focus area
      const width = Math.min(Math.floor(viewfinderWidth * 0.85), 450);
      const height = Math.min(Math.floor(viewfinderHeight * 0.65), 320);
      return { width, height };
    }
  };

  const startScanner = (mode, currentScanMode = scanMode) => {
    if (html5QrCodeRef.current && !isScanningRef.current) {
      isScanningRef.current = true;

      const aspectRatioVal = aspectRatioMode === '16:9' ? 1.777778 : (aspectRatioMode === '4:3' ? 1.333333 : 1.0);

      html5QrCodeRef.current.start(
        { facingMode: mode },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => getScanBox(viewfinderWidth, viewfinderHeight),
          aspectRatio: aspectRatioVal,
          disableFlip: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF
          ]
        },
        (decodedText) => {
          if (decodedText !== lastScanned.current) {
            lastScanned.current = decodedText;
            playBeep();
            onScan(decodedText);
            setTimeout(() => {
              lastScanned.current = '';
            }, 2500);
          }
        },
        () => {
          // ignore scan frame errors
        }
      ).then(() => {
        setTimeout(() => {
          inspectTrackCapabilities();
          if (zoomLevel > 1) {
            applyZoom(zoomLevel);
          }
        }, 500);
      }).catch(err => {
        console.error("Camera start failed", err);
        isScanningRef.current = false;
      });
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && isScanningRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        isScanningRef.current = false;
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
    }
  };

  // Restart camera when scan mode or aspect ratio changes while open
  const restartScanner = async (newMode = facingMode, newScanMode = scanMode) => {
    if (showCamera) {
      await stopScanner();
      startScanner(newMode, newScanMode);
    }
  };

  useEffect(() => {
    if (showCamera) {
      html5QrCodeRef.current = new Html5Qrcode("qr-reader", { verbose: false });
      startScanner(facingMode, scanMode);
    } else {
      stopScanner().then(() => {
        if (html5QrCodeRef.current) {
          html5QrCodeRef.current.clear();
          html5QrCodeRef.current = null;
        }
      });
    }

    return () => {
      if (html5QrCodeRef.current) {
        stopScanner().then(() => {
          if (html5QrCodeRef.current) {
            html5QrCodeRef.current.clear();
          }
        });
      }
    };
  }, [showCamera, aspectRatioMode]);

  const toggleCameraFacing = async () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    await restartScanner(newMode, scanMode);
  };

  const handleScanModeChange = async (mode) => {
    setScanMode(mode);
    await restartScanner(facingMode, mode);
  };

  // Calculate container max-height based on viewSize
  const getViewHeight = () => {
    switch (viewSize) {
      case 'compact': return '240px';
      case 'large': return '480px';
      default: return '340px';
    }
  };

  return (
    <div className="scan-wrapper" style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
      {/* ── Operator / Scanner Personnel Selector Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: 'var(--ink-2)' }}>
            <UserCheck size={14} /> ผู้สแกน:
          </span>
          {/* Read-only: the operator comes from the signed-in session and
              cannot be switched by hand. */}
          <span
            title="ชื่อผู้สแกนมาจากบัญชีที่เข้าสู่ระบบ เปลี่ยนเองไม่ได้"
            style={{ padding: '4px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', color: 'var(--ink)' }}
          >
            👤 {currentOperator || '—'}
            {currentStaff?.role ? ` (${currentStaff.role})` : ''}
          </span>
          {/* Sign-out deliberately does NOT live on the scanning screen: one stray
              tap next to the scan field used to strand a field station for the rest
              of the race. It now sits in the navbar behind a confirmation. */}
        </div>

        {/* Mini Readiness Status Indicator */}
        <div>
          {runners && runners.length > 0 && lastSyncedTime ? (
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '5px', 
              fontSize: '11.5px', 
              fontWeight: 700, 
              color: '#15803d', 
              background: '#dcfce7', 
              padding: '3px 9px', 
              borderRadius: '12px',
              border: '1px solid #86efac'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }}></span>
              พร้อมสแกน ({runners.length} คน)
            </span>
          ) : (
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '4px', 
              fontSize: '11.5px', 
              fontWeight: 700, 
              color: '#92400e', 
              background: '#fef3c7', 
              padding: '3px 9px', 
              borderRadius: '12px',
              border: '1px solid #fde68a'
            }}>
              ⚠️ รอเตรียมข้อมูล
            </span>
          )}
        </div>
      </div>

      {/* ── Main Input & Action Buttons Bar ── */}
      <div className="scan-flex" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
        <div className="scan-input-wrap" style={{ flex: 1, position: 'relative', margin: 0 }}>
          <ScanLine size={22} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-2)' }} />
          <input 
            className="scan-input" 
            placeholder="สแกน BIB Barcode / QR Code…" 
            autoComplete="off" 
            inputMode="numeric"
            value={bibInput}
            onChange={(e) => setBibInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={!showCamera}
            style={{ width: '100%', paddingLeft: '48px' }}
          />
        </div>
        
        {/* Toggle Sound */}
        <button 
          className="btn-icon" 
          title={soundEnabled ? "ปิดเสียงบี๊บ" : "เปิดเสียงบี๊บ"}
          onClick={() => setSoundEnabled(!soundEnabled)}
          style={{ padding: '10px', borderRadius: '10px', border: '1px solid var(--line)', background: soundEnabled ? 'var(--bg-soft)' : '#fee2e2', color: soundEnabled ? 'var(--ink)' : 'var(--ink-2)' }}
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>

        {/* Flip Camera Facing Button */}
        {showCamera && (
          <button 
            className="btn-icon" 
            title="สลับกล้องหน้า/หลัง"
            onClick={toggleCameraFacing}
            style={{ padding: '10px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--bg-soft)' }}
          >
            <RefreshCcw size={20} />
          </button>
        )}

        {/* Toggle Camera Open/Close Button */}
        <button 
          className={`btn-icon ${showCamera ? 'active' : ''}`} 
          title={showCamera ? "ปิดกล้องสแกน" : "เปิดกล้องสแกนเนอร์"}
          onClick={() => setShowCamera(!showCamera)}
          style={{ 
            padding: '10px 14px', 
            borderRadius: '10px', 
            border: '1px solid var(--line)', 
            background: showCamera ? 'var(--warn)' : 'var(--ink)', 
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            fontSize: '13px'
          }}
        >
          {showCamera ? <><X size={18} /> ปิดกล้อง</> : <><Camera size={18} /> เปิดกล้อง</>}
        </button>
      </div>

      {/* ── Camera Viewfinder & Interactive Controls ── */}
      {showCamera && (
        <div style={{ marginTop: '14px', background: '#0f172a', borderRadius: '14px', overflow: 'hidden', border: '1px solid #334155', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          
          {/* Top Control Bar: Mode & Viewport Controls */}
          <div style={{ background: '#1e293b', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #334155' }}>
            
            {/* Mode Switcher: Barcode 1D / QR Code 2D / Wide */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginRight: '2px' }}>โหมด:</span>
              <button 
                type="button"
                onClick={() => handleScanModeChange('barcode')}
                style={{ 
                  padding: '4px 10px', 
                  fontSize: '12px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: scanMode === 'barcode' ? 'var(--start)' : '#334155',
                  color: scanMode === 'barcode' ? '#000' : '#e2e8f0'
                }}
              >
                <Barcode size={14} /> Barcode (1D)
              </button>
              <button 
                type="button"
                onClick={() => handleScanModeChange('qr')}
                style={{ 
                  padding: '4px 10px', 
                  fontSize: '12px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: scanMode === 'qr' ? 'var(--start)' : '#334155',
                  color: scanMode === 'qr' ? '#000' : '#e2e8f0'
                }}
              >
                <QrCode size={14} /> QR Code (2D)
              </button>
              <button 
                type="button"
                onClick={() => handleScanModeChange('wide')}
                style={{ 
                  padding: '4px 10px', 
                  fontSize: '12px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: scanMode === 'wide' ? 'var(--start)' : '#334155',
                  color: scanMode === 'wide' ? '#000' : '#e2e8f0'
                }}
              >
                <Maximize2 size={13} /> ทั่วไป (Wide)
              </button>
            </div>

            {/* Right Tools: View Size & Aspect Ratio */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Torch Button */}
              <button 
                type="button"
                onClick={toggleTorch}
                title={isTorchOn ? "ปิดไฟฉาย" : "เปิดไฟฉายช่วยสแกน"}
                style={{ 
                  padding: '5px 9px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  cursor: 'pointer',
                  background: isTorchOn ? '#fef08a' : '#334155',
                  color: isTorchOn ? '#854d0e' : '#cbd5e1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                {isTorchOn ? <Flashlight size={14} /> : <FlashlightOff size={14} />}
                <span style={{ fontSize: '11px' }}>{isTorchOn ? 'ไฟเปิด' : 'ไฟฉาย'}</span>
              </button>

              {/* View Size Toggle */}
              <button 
                type="button"
                onClick={() => setViewSize(viewSize === 'standard' ? 'large' : (viewSize === 'large' ? 'compact' : 'standard'))}
                title="ปรับขนาดหน้าต่างกล้อง"
                style={{ padding: '5px 8px', borderRadius: '6px', border: 'none', background: '#334155', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                {viewSize === 'compact' ? '🔍 เล็ก' : (viewSize === 'large' ? '🔍 ใหญ่' : '🔍 ปกติ')}
              </button>
            </div>
          </div>

          {/* Camera Viewport Canvas */}
          <div 
            style={{ 
              position: 'relative', 
              width: '100%', 
              maxHeight: getViewHeight(), 
              overflow: 'hidden', 
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div id="qr-reader" style={{ width: '100%', minHeight: '200px' }}></div>
          </div>

          {/* Bottom Zoom & Focus Slider Bar */}
          <div style={{ background: '#1e293b', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', borderTop: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ZoomIn size={14} /> ซูมโฟกัส:
              </span>
              
              {/* Preset Zoom Buttons */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 1.5, 2, 2.5, 3].map((z) => (
                  <button 
                    key={z} 
                    type="button"
                    onClick={() => applyZoom(z)}
                    style={{ 
                      padding: '2px 8px', 
                      fontSize: '11.5px', 
                      borderRadius: '4px', 
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      background: zoomLevel === z ? 'var(--start)' : '#334155',
                      color: zoomLevel === z ? '#000' : '#e2e8f0'
                    }}
                  >
                    {z}x
                  </button>
                ))}
              </div>

              {/* Slider for smooth zoom */}
              <input 
                type="range" 
                min="1" 
                max="3.5" 
                step="0.1" 
                value={zoomLevel} 
                onChange={(e) => applyZoom(parseFloat(e.target.value))}
                style={{ flex: 1, minWidth: '70px', accentColor: 'var(--start)', cursor: 'pointer' }} 
              />
              <span style={{ fontSize: '11px', color: '#cbd5e1', fontFamily: 'var(--mono)', minWidth: '30px' }}>
                {zoomLevel.toFixed(1)}x
              </span>
            </div>

            {/* Aspect Ratio Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>สัดส่วน:</span>
              <button 
                type="button"
                onClick={() => setAspectRatioMode(aspectRatioMode === '16:9' ? '1:1' : (aspectRatioMode === '1:1' ? '4:3' : '16:9'))}
                style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '4px', border: 'none', background: '#334155', color: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}
              >
                {aspectRatioMode}
              </button>
            </div>
          </div>

          <div style={{ padding: '6px 12px', background: '#0f172a', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
              💡 <b>ทริค:</b> กดปุ่ม <b>1.5x</b> หรือ <b>2x</b> เพื่อสแกน Barcode/QR บนเบอร์วิ่ง BIB จากระยะยืนได้คมชัดยิ่งขึ้นโดยไม่ต้องก้มตัว
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
