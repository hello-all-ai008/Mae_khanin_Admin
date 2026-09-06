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
  UserCheck,
  CornerDownLeft
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useRace } from '../context/RaceContext';
import { normalizeScannedBib, smartFindRunner } from '../lib/bibUtils';

export default function ScannerInput({ onScan }) {
  const { currentOperator, currentStaff, runners, lastSyncedTime } = useRace();
  const [bibInput, setBibInput] = useState('');
  const [lastDetected, setLastDetected] = useState(null);
  
  // Camera State
  const [showCamera, setShowCamera] = useState(() => {
    return localStorage.getItem('trail_camera_active') === 'true';
  });
  const [facingMode, setFacingMode] = useState(() => {
    return localStorage.getItem('trail_camera_facing') || 'environment';
  });
  
  // Focus & Scanning Mode: 'full' (เต็มกล้อง - ค่าเริ่มต้น), 'barcode' (1D wide), 'qr' (2D square), 'center' (80% center)
  const [scanMode, setScanMode] = useState(() => {
    const saved = localStorage.getItem('trail_camera_scan_mode');
    return (saved && ['full', 'barcode', 'qr', 'center'].includes(saved)) ? saved : 'full';
  });

  // View Size: 'auto' (เต็มจอ ไม่ครอปตัด - ค่าเริ่มต้น) | 'standard' (380px) | 'compact' (260px) | 'large' (540px)
  const [viewSize, setViewSize] = useState(() => {
    const saved = localStorage.getItem('trail_camera_view_size');
    return (saved && ['auto', 'standard', 'compact', 'large'].includes(saved)) ? saved : 'auto';
  });

  // Aspect Ratio: 'auto' (สัดส่วนธรรมชาติเต็มเลนส์ - ค่าเริ่มต้น) | '16:9' | '4:3' | '1:1'
  const [aspectRatioMode, setAspectRatioMode] = useState(() => {
    const saved = localStorage.getItem('trail_camera_aspect_ratio');
    return (saved && ['auto', '16:9', '4:3', '1:1'].includes(saved)) ? saved : 'auto';
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

  const submitBib = (val) => {
    const raw = typeof val === 'string' ? val : bibInput;
    if (!raw || !String(raw).trim()) return;
    const rawTrimmed = String(raw).trim();

    // 1. Try smart matching against currently loaded runners
    const matchedRunner = smartFindRunner(rawTrimmed, runners);
    const resolvedBib = matchedRunner?.bib
      ? String(matchedRunner.bib).trim()
      : (normalizeScannedBib(rawTrimmed) || rawTrimmed);

    if (!resolvedBib) return;

    setLastDetected({
      raw: rawTrimmed,
      bib: resolvedBib,
      runner: matchedRunner,
      matched: !!matchedRunner,
      time: Date.now()
    });

    playBeep();
    onScan(resolvedBib);
    setBibInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitBib();
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

  const getScanBox = (viewfinderWidth, viewfinderHeight, currentScanMode = scanMode) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    
    if (currentScanMode === 'full') {
      // 📱 เต็มกล้อง (Full Frame): สแกนครอบคลุม 96% ทั่วทั้งหน้าจอกล้อง
      return { 
        width: Math.max(Math.floor(viewfinderWidth * 0.96), 200), 
        height: Math.max(Math.floor(viewfinderHeight * 0.96), 200) 
      };
    } else if (currentScanMode === 'barcode') {
      // ▬ Barcode 1D: แถบแนวนอนยาว โฟกัสเฉพาะเส้นบาร์โค้ด
      const width = Math.min(Math.floor(viewfinderWidth * 0.92), 480);
      const height = Math.min(Math.floor(viewfinderHeight * 0.38), 150);
      return { width: Math.max(width, 240), height: Math.max(height, 80) };
    } else if (currentScanMode === 'qr') {
      // ⬛ QR Code 2D: สี่เหลี่ยมจัตุรัสตรงกลาง
      const edge = Math.min(Math.floor(minEdge * 0.72), 300);
      return { width: Math.max(edge, 180), height: Math.max(edge, 180) };
    } else {
      // 🎯 ตรงกลาง (Center Focus): สี่เหลี่ยมกว้าง 84%
      const width = Math.min(Math.floor(viewfinderWidth * 0.84), 440);
      const height = Math.min(Math.floor(viewfinderHeight * 0.68), 320);
      return { width, height };
    }
  };

  const getAspectRatioVal = (mode = aspectRatioMode) => {
    if (mode === '16:9') return 1.777778;
    if (mode === '4:3') return 1.333333;
    if (mode === '1:1') return 1.0;
    return undefined; // 'auto' -> use native full camera sensor ratio
  };

  const startScanner = (mode = facingMode, currentScanMode = scanMode, currentAspect = aspectRatioMode) => {
    if (html5QrCodeRef.current && !isScanningRef.current) {
      isScanningRef.current = true;

      const aspectRatioVal = getAspectRatioVal(currentAspect);

      let formats = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.PDF_417
      ];
      if (currentScanMode === 'qr') {
        formats = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
          Html5QrcodeSupportedFormats.PDF_417
        ];
      } else if (currentScanMode === 'barcode') {
        formats = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ];
      }

      const scanConfig = {
        fps: 20,
        disableFlip: false,
        formatsToSupport: formats,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        qrbox: (viewfinderWidth, viewfinderHeight) => 
          getScanBox(viewfinderWidth, viewfinderHeight, currentScanMode)
      };

      if (aspectRatioVal) {
        scanConfig.aspectRatio = aspectRatioVal;
      }

      html5QrCodeRef.current.start(
        { facingMode: mode },
        scanConfig,
        (decodedText) => {
          if (!decodedText) return;
          const rawTrimmed = String(decodedText).trim();
          if (!rawTrimmed) return;

          // 1. Resolve runner using smartFindRunner against loaded runners
          const matchedRunner = smartFindRunner(rawTrimmed, runners);
          const resolvedBib = matchedRunner?.bib
            ? String(matchedRunner.bib).trim()
            : (normalizeScannedBib(rawTrimmed) || rawTrimmed);

          if (resolvedBib && resolvedBib !== lastScanned.current) {
            lastScanned.current = resolvedBib;
            setLastDetected({
              raw: rawTrimmed,
              bib: resolvedBib,
              runner: matchedRunner,
              matched: !!matchedRunner,
              time: Date.now()
            });

            playBeep();
            onScan(resolvedBib);

            // Shorter debounce if not matched (1000ms) so operator can adjust immediately
            const debounceMs = matchedRunner ? 2000 : 1000;
            setTimeout(() => {
              lastScanned.current = '';
            }, debounceMs);
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
  const restartScanner = async (newMode = facingMode, newScanMode = scanMode, newAspect = aspectRatioMode) => {
    if (showCamera) {
      await stopScanner();
      startScanner(newMode, newScanMode, newAspect);
    }
  };

  useEffect(() => {
    if (showCamera) {
      html5QrCodeRef.current = new Html5Qrcode("qr-reader", { verbose: false });
      startScanner(facingMode, scanMode, aspectRatioMode);
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
  }, [showCamera]);

  const toggleCameraFacing = async () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    await restartScanner(newMode, scanMode, aspectRatioMode);
  };

  const handleScanModeChange = async (mode) => {
    setScanMode(mode);
    await restartScanner(facingMode, mode, aspectRatioMode);
  };

  const handleAspectRatioChange = async (aspect) => {
    setAspectRatioMode(aspect);
    await restartScanner(facingMode, scanMode, aspect);
  };

  // Calculate container max-height based on viewSize
  const getViewHeight = () => {
    switch (viewSize) {
      case 'compact': return '260px';
      case 'standard': return '380px';
      case 'large': return '540px';
      case 'auto': return 'none'; // เต็มความสูง ไม่ครอปตัด
      default: return 'none';
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
      <div className="scan-flex" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
        <div className="scan-input-wrap" style={{ flex: '1 1 260px', position: 'relative', margin: 0, minWidth: '200px' }}>
          <ScanLine size={22} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-2)' }} />
          <input 
            className="scan-input" 
            placeholder="สแกน BIB หรือพิมพ์หมายเลข…" 
            autoComplete="off" 
            inputMode="numeric"
            value={bibInput}
            onChange={(e) => setBibInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={!showCamera}
            style={{ width: '100%', paddingLeft: '48px', paddingRight: bibInput ? '38px' : '16px' }}
          />
          {bibInput && (
            <button
              type="button"
              onClick={() => setBibInput('')}
              title="ล้างหมายเลขที่พิมพ์"
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Enter BIB Button for Manual Typing */}
        <button 
          type="button"
          onClick={() => submitBib()}
          disabled={!bibInput.trim()}
          title="กดเพื่อบันทึกหมายเลข BIB ที่พิมพ์ (Enter BIB)"
          style={{ 
            height: '46px',
            padding: '0 16px', 
            borderRadius: '10px', 
            fontWeight: 700, 
            fontSize: '13.5px', 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            whiteSpace: 'nowrap',
            background: bibInput.trim() ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--bg-soft)', 
            color: bibInput.trim() ? '#ffffff' : 'var(--ink-2)', 
            border: bibInput.trim() ? 'none' : '1px solid var(--line)', 
            cursor: bibInput.trim() ? 'pointer' : 'not-allowed',
            boxShadow: bibInput.trim() ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none',
            transition: 'all 0.2s ease',
            opacity: bibInput.trim() ? 1 : 0.65
          }}
        >
          <CornerDownLeft size={16} />
          <span>Enter BIB</span>
        </button>
        
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
            
            {/* Mode Switcher: Full (Default) / Barcode 1D / QR Code 2D / Center */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginRight: '2px' }}>มุมมองสแกน:</span>
              <button 
                type="button"
                onClick={() => handleScanModeChange('full')}
                title="สแกนเต็มกล้องทั้งหน้าจอ ไม่จำกัดกรอบแคบ (สแกนได้ทั้ง Barcode และ QR)"
                style={{ 
                  padding: '5px 12px', 
                  fontSize: '12px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: scanMode === 'full' ? 'var(--start)' : '#334155',
                  color: scanMode === 'full' ? '#000' : '#e2e8f0',
                  boxShadow: scanMode === 'full' ? '0 0 10px rgba(0, 255, 128, 0.3)' : 'none'
                }}
              >
                <Maximize2 size={13} /> เต็มกล้อง (Full)
              </button>
              <button 
                type="button"
                onClick={() => handleScanModeChange('barcode')}
                title="กรอบแนวนอนยาว เหมาะสำหรับเล็งเฉพาะเส้นบาร์โค้ด 1D"
                style={{ 
                  padding: '5px 10px', 
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
                title="กรอบสี่เหลี่ยมจัตุรัส เหมาะสำหรับ QR Code 2D"
                style={{ 
                  padding: '5px 10px', 
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
                onClick={() => handleScanModeChange('center')}
                title="กรอบโฟกัสกึ่งกลาง 84%"
                style={{ 
                  padding: '5px 10px', 
                  fontSize: '12px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: scanMode === 'center' ? 'var(--start)' : '#334155',
                  color: scanMode === 'center' ? '#000' : '#e2e8f0'
                }}
              >
                <ScanLine size={13} /> กึ่งกลาง
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
                onClick={() => setViewSize(viewSize === 'auto' ? 'standard' : (viewSize === 'standard' ? 'large' : (viewSize === 'large' ? 'compact' : 'auto')))}
                title="ปรับขนาดความสูงของหน้าต่างกล้อง"
                style={{ padding: '5px 9px', borderRadius: '6px', border: 'none', background: '#334155', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                {viewSize === 'auto' ? '📐 จอเต็ม (Auto)' : (viewSize === 'compact' ? '🔍 กะทัดรัด' : (viewSize === 'large' ? '🔍 ขยายใหญ่' : '🔍 พอดี'))}
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
            <div id="qr-reader" style={{ width: '100%', minHeight: '220px', border: 'none' }}></div>
          </div>

          {/* Live Scanner Detection Badge */}
          {lastDetected && (
            <div 
              style={{ 
                padding: '8px 14px', 
                background: lastDetected.matched ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)', 
                borderTop: `1px solid ${lastDetected.matched ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                borderBottom: '1px solid #334155',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                animation: 'fadeIn 0.2s ease-in-out'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: 700, 
                  color: lastDetected.matched ? '#4ade80' : '#f87171',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {lastDetected.matched ? '✓ ตรวจพบ:' : '⚠️ ไม่พบรหัสในฐานข้อมูล:'}
                  <span style={{ 
                    fontFamily: 'var(--mono)', 
                    fontSize: '13px', 
                    padding: '2px 8px', 
                    borderRadius: '5px', 
                    background: lastDetected.matched ? '#14532d' : '#7f1d1d', 
                    color: '#ffffff',
                    border: `1px solid ${lastDetected.matched ? '#22c55e' : '#ef4444'}`,
                    fontWeight: 700
                  }}>
                    BIB {lastDetected.bib}
                  </span>
                </span>
                {lastDetected.runner && (
                  <span style={{ fontSize: '12.5px', color: '#f8fafc', fontWeight: 600 }}>
                    {lastDetected.runner.name} {lastDetected.runner.cat ? `(${lastDetected.runner.cat})` : ''}
                  </span>
                )}
              </div>
              {lastDetected.raw && lastDetected.raw !== lastDetected.bib && (
                <span 
                  title={lastDetected.raw}
                  style={{ 
                    fontSize: '11px', 
                    color: '#94a3b8', 
                    fontFamily: 'var(--mono)', 
                    maxWidth: '260px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap' 
                  }}
                >
                  Raw: {lastDetected.raw}
                </span>
              )}
            </div>
          )}

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
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>สัดส่วนเลนส์:</span>
              {[
                { id: 'auto', label: 'เต็มกล้อง' },
                { id: '16:9', label: '16:9' },
                { id: '4:3', label: '4:3' },
                { id: '1:1', label: '1:1' }
              ].map((asp) => (
                <button 
                  key={asp.id}
                  type="button"
                  onClick={() => handleAspectRatioChange(asp.id)}
                  style={{ 
                    padding: '2px 8px', 
                    fontSize: '11px', 
                    borderRadius: '4px', 
                    border: 'none', 
                    cursor: 'pointer', 
                    fontWeight: 600,
                    background: aspectRatioMode === asp.id ? 'var(--start)' : '#334155', 
                    color: aspectRatioMode === asp.id ? '#000' : '#f8fafc' 
                  }}
                >
                  {asp.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '6px 12px', background: '#0f172a', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
              💡 <b>โหมดเต็มกล้อง (Full):</b> สแกน Barcode/QR ได้ทุกบริเวณทั่วทั้งจอ ไม่ต้องเล็งเข้ากรอบแคบ | กด <b>1.5x / 2x</b> เพื่อสแกนจากระยะยืนได้ง่ายขึ้น
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
