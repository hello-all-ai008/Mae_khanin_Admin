import { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  ScanLine, 
  X, 
  RefreshCcw, 
  ZoomIn, 
  Flashlight, 
  FlashlightOff, 
  Volume2,
  VolumeX,
  UserCheck,
  CornerDownLeft
} from 'lucide-react';
import { useRace } from '../context/RaceContext';
import { normalizeScannedBib, smartFindRunner } from '../lib/bibUtils';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { createScanGate } from '../lib/scanner/scanGate';
import { warmUpDetector } from '../lib/scanner/detector';

const SUCCESS_VIBRATE_MS = 60;
const MIN_VIEWPORT_HEIGHT = '200px';
const VIEW_SIZE_HEIGHTS = { compact: '260px', standard: '380px', large: '540px' };

const CAMERA_ERROR_MESSAGES = {
  permission: 'ไม่ได้รับอนุญาตให้ใช้กล้อง — กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์ แล้วกด "ลองใหม่" (ยังพิมพ์เลข BIB ด้วยมือได้)',
  'no-camera': 'ไม่พบกล้องบนอุปกรณ์นี้ (ยังพิมพ์เลข BIB ด้วยมือได้)',
  busy: 'ไม่สามารถเปิดกล้องได้ อาจมีแอปอื่นกำลังใช้กล้องอยู่ — ปิดแอปนั้นแล้วกด "ลองใหม่"',
  unsupported: 'เบราว์เซอร์นี้ไม่รองรับการใช้กล้อง (ต้องเปิดผ่าน HTTPS) — ยังพิมพ์เลข BIB ด้วยมือได้',
  decoder: 'โหลดตัวอ่านบาร์โค้ด/QR ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วกด "ลองใหม่" (ยังพิมพ์เลข BIB ด้วยมือได้)',
  unknown: 'เปิดกล้องไม่สำเร็จ — กด "ลองใหม่" หรือพิมพ์เลข BIB ด้วยมือ',
};

export default function ScannerInput({ onScan }) {
  const { currentOperator, currentStaff, runners, lastSyncedTime, categories } = useRace();
  const [bibInput, setBibInput] = useState('');
  const [lastDetected, setLastDetected] = useState(null);
  
  // Camera State
  const [showCamera, setShowCamera] = useState(() => {
    return localStorage.getItem('trail_camera_active') === 'true';
  });
  const [facingMode, setFacingMode] = useState(() => {
    return localStorage.getItem('trail_camera_facing') || 'environment';
  });

  // View Size: 'auto' (เต็มจอ ไม่ครอปตัด - ค่าเริ่มต้น) | 'standard' (380px) | 'compact' (260px) | 'large' (540px)
  const [viewSize, setViewSize] = useState(() => {
    const saved = localStorage.getItem('trail_camera_view_size');
    return (saved && ['auto', 'standard', 'compact', 'large'].includes(saved)) ? saved : 'auto';
  });

  // Sound Feedback
  const [soundEnabled, setSoundEnabled] = useState(true);

  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const scanGateRef = useRef(null);
  if (scanGateRef.current === null) scanGateRef.current = createScanGate();
  const audioCtxRef = useRef(null);
  const lastBeepTimeRef = useRef(0);

  // Keep fresh mutable references so camera scan callback never suffers from stale closure
  const runnersRef = useRef(runners);
  runnersRef.current = runners;

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  // Pre-load the wasm decoder while the network is still available (no-op when native detection works)
  useEffect(() => {
    warmUpDetector();
  }, []);

  // Save persistent preferences
  useEffect(() => {
    localStorage.setItem('trail_camera_active', showCamera);
  }, [showCamera]);

  useEffect(() => {
    localStorage.setItem('trail_camera_facing', facingMode);
  }, [facingMode]);

  useEffect(() => {
    localStorage.setItem('trail_camera_view_size', viewSize);
  }, [viewSize]);


  // Play pleasant beep sound using Web Audio API with rate-limiting
  const playBeep = () => {
    if (!soundEnabled) return;
    const now = Date.now();
    if (now - lastBeepTimeRef.current < 250) return;
    lastBeepTimeRef.current = now;

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

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

    const currentRunners = runnersRef.current || runners || [];
    // 1. Try smart matching against currently loaded runners
    const matchedRunner = smartFindRunner(rawTrimmed, currentRunners);
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
    if (onScanRef.current) {
      onScanRef.current(resolvedBib, matchedRunner);
    }
    setBibInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitBib();
    }
  };

  // Called by the scanner hook once a code is confirmed (2D immediately, 1D after two matching reads)
  const handleDetected = (decodedText) => {
    if (!decodedText) return;
    const cleanText = String(decodedText)
      .replace(/[\u200B-\u200D\uFEFF\x00-\x1F\x7F]/g, '')
      .trim();
    if (!cleanText) return;

    const now = Date.now();
    const gate = scanGateRef.current;

    // Global camera throttle: ignore frames within 750ms of previous scan
    if (gate.isThrottled(now)) return;

    // 1. Resolve runner using smartFindRunner against loaded runners via runnersRef
    const currentRunners = runnersRef.current || runners || [];
    const matchedRunner = smartFindRunner(cleanText, currentRunners);
    const resolvedBib = matchedRunner?.bib
      ? String(matchedRunner.bib).trim()
      : (normalizeScannedBib(cleanText) || cleanText);

    if (!resolvedBib) return;

    // Same-bib debounce (2000ms matched / 1200ms unmatched)
    const verdict = gate.accept({ now, bib: resolvedBib, matched: !!matchedRunner });
    if (!verdict.accepted) return;

    setLastDetected({
      raw: cleanText,
      bib: resolvedBib,
      runner: matchedRunner,
      matched: !!matchedRunner,
      time: now
    });

    playBeep();

    try {
      if (onScanRef.current) {
        onScanRef.current(resolvedBib, matchedRunner);
      }
    } catch (scanErr) {
      console.error('onScan execution error:', scanErr);
    }

    try {
      navigator.vibrate?.(SUCCESS_VIBRATE_MS);
    } catch (vibrateErr) {
      console.warn('Vibration failed:', vibrateErr);
    }

    setTimeout(() => gate.release(resolvedBib), verdict.clearDelayMs);
  };

  const {
    error: cameraError,
    isReady: isCameraReady,
    supportsTorch,
    isTorchOn,
    toggleTorch,
    zoomLevel,
    cssZoom,
    setZoom: applyZoom,
    focusAt,
    retry: retryCamera,
  } = useBarcodeScanner({
    enabled: showCamera,
    facingMode,
    videoRef,
    overlayRef,
    onDetect: handleDetected,
  });

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Tap-to-focus: map the tap to a normalized point inside the viewport
  const handleViewportTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    focusAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  const isFixedHeight = viewSize !== 'auto';
  const viewHeight = VIEW_SIZE_HEIGHTS[viewSize];

  return (
    <div className="scan-wrapper" style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* ── Operator / Readiness Micro Status Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11.5px', color: 'var(--ink-2)', width: '100%', boxSizing: 'border-box', padding: '0 2px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
          <UserCheck size={13} style={{ color: '#2563eb' }} />
          ผู้สแกน: <b style={{ color: 'var(--ink)' }}>{currentOperator || 'Staff'}</b>
        </span>
        <span>
          {runners && runners.length > 0 && lastSyncedTime ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 700 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px rgba(34, 197, 94, 0.4)' }}></span>
              พร้อมสแกน {runners.length} คน
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 700 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }}></span>
              รอข้อมูล
            </span>
          )}
        </span>
      </div>

      {/* ── Main Input & Action Buttons Bar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '100%', boxSizing: 'border-box', marginBottom: '14px' }}>
        {/* Row 1: Manual Input + Enter BIB */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div className="scan-input-wrap" style={{ flex: '1 1 auto', position: 'relative', margin: 0, minWidth: 0 }}>
            <ScanLine size={19} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-2)' }} />
            <input 
              className="scan-input" 
              placeholder="สแกน BIB หรือพิมพ์เลข…" 
              autoComplete="off" 
              inputMode="numeric"
              value={bibInput}
              onChange={(e) => setBibInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus={!showCamera}
              style={{ 
                width: '100%', 
                height: '44px',
                padding: '0 36px 0 38px', 
                fontSize: '15.5px',
                borderRadius: '10px'
              }}
            />
            {bibInput && (
              <button
                type="button"
                onClick={() => setBibInput('')}
                title="ล้างหมายเลขที่พิมพ์"
                style={{
                  position: 'absolute',
                  right: '8px',
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
              height: '44px',
              padding: '0 14px', 
              borderRadius: '10px', 
              fontWeight: 700, 
              fontSize: '13px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '5px', 
              whiteSpace: 'nowrap',
              background: bibInput.trim() ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--bg-soft)', 
              color: bibInput.trim() ? '#ffffff' : 'var(--ink-2)', 
              border: bibInput.trim() ? 'none' : '1px solid var(--line)', 
              cursor: bibInput.trim() ? 'pointer' : 'not-allowed',
              boxShadow: bibInput.trim() ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none',
              transition: 'all 0.2s ease',
              opacity: bibInput.trim() ? 1 : 0.65,
              flexShrink: 0
            }}
          >
            <CornerDownLeft size={15} />
            <span>Enter BIB</span>
          </button>
        </div>

        {/* Row 2: Camera & Sound Utility Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {/* Toggle Sound */}
          <button 
            type="button"
            className="btn-icon" 
            title={soundEnabled ? "ปิดเสียงบี๊บ" : "เปิดเสียงบี๊บ"}
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ 
              height: '38px',
              padding: '0 12px', 
              borderRadius: '9px', 
              border: '1px solid var(--line)', 
              background: soundEnabled ? 'var(--bg-soft)' : '#fee2e2', 
              color: soundEnabled ? 'var(--ink)' : '#dc2626',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span style={{ fontSize: '11.5px' }}>{soundEnabled ? 'เปิดเสียง' : 'ปิดเสียง'}</span>
          </button>

          {/* Flip Camera Facing Button */}
          {showCamera && (
            <button 
              type="button"
              className="btn-icon" 
              title="สลับกล้องหน้า/หลัง"
              onClick={toggleCameraFacing}
              style={{ 
                height: '38px',
                padding: '0 12px', 
                borderRadius: '9px', 
                border: '1px solid var(--line)', 
                background: 'var(--bg-soft)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <RefreshCcw size={16} />
              <span style={{ fontSize: '11.5px' }}>สลับกล้อง</span>
            </button>
          )}

          {/* Toggle Camera Open/Close Button */}
          <button 
            type="button"
            className={`btn-icon ${showCamera ? 'active' : ''}`} 
            title={showCamera ? "ปิดกล้องสแกน" : "เปิดกล้องสแกนเนอร์"}
            onClick={() => setShowCamera(!showCamera)}
            style={{ 
              height: '38px',
              padding: '0 14px', 
              borderRadius: '9px', 
              border: '1px solid var(--line)', 
              background: showCamera ? '#dc2626' : 'var(--ink)', 
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              fontSize: '12.5px',
              flex: '1 1 auto',
              justifyContent: 'center',
              maxWidth: showCamera ? '140px' : '170px'
            }}
          >
            {showCamera ? <><X size={16} /> ปิดกล้อง</> : <><Camera size={16} /> เปิดกล้องสแกน</>}
          </button>
        </div>
      </div>

      {/* ── Camera Viewfinder & Interactive Controls ── */}
      {showCamera && (
        <div style={{ marginTop: '14px', background: '#0f172a', borderRadius: '14px', overflow: 'hidden', border: '1px solid #334155', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Top Control Bar */}
          <div style={{ background: '#1e293b', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #334155', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, flex: 1, minWidth: 0 }}>
              {isCameraReady ? 'พร้อมสแกน — เล็ง QR / บาร์โค้ดตรงไหนก็ได้ในภาพ' : (cameraError ? 'กล้องไม่พร้อมใช้งาน' : 'กำลังเปิดกล้อง…')}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {/* Torch Button (only when the device supports it) */}
              {supportsTorch && (
                <button 
                  type="button"
                  onClick={toggleTorch}
                  title={isTorchOn ? "ปิดไฟฉาย" : "เปิดไฟฉายช่วยสแกน"}
                  style={{ 
                    padding: '4px 8px', 
                    borderRadius: '6px', 
                    border: 'none', 
                    cursor: 'pointer',
                    background: isTorchOn ? '#fef08a' : '#334155',
                    color: isTorchOn ? '#854d0e' : '#cbd5e1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  {isTorchOn ? <Flashlight size={13} /> : <FlashlightOff size={13} />}
                  <span>{isTorchOn ? 'ไฟเปิด' : 'ไฟฉาย'}</span>
                </button>
              )}

              {/* View Size Toggle */}
              <button 
                type="button"
                onClick={() => setViewSize(viewSize === 'auto' ? 'standard' : (viewSize === 'standard' ? 'large' : (viewSize === 'large' ? 'compact' : 'auto')))}
                title="ปรับขนาดความสูงของหน้าต่างกล้อง"
                style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: '#334155', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                {viewSize === 'auto' ? '📐 จอเต็ม' : (viewSize === 'compact' ? '🔍 กะทัดรัด' : (viewSize === 'large' ? '🔍 ใหญ่' : '🔍 พอดี'))}
              </button>
            </div>
          </div>

          {/* Camera Viewport: video + detection overlay share the same object-fit */}
          <div 
            onClick={handleViewportTap}
            style={{ 
              position: 'relative', 
              width: '100%', 
              maxWidth: '100%',
              height: isFixedHeight ? viewHeight : 'auto',
              minHeight: MIN_VIEWPORT_HEIGHT,
              overflow: 'hidden', 
              background: '#000',
              boxSizing: 'border-box'
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: isFixedHeight ? '100%' : 'auto',
                transform: cssZoom > 1 ? `scale(${cssZoom})` : 'none',
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease-out'
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                style={{ display: 'block', width: '100%', height: isFixedHeight ? '100%' : 'auto', minHeight: MIN_VIEWPORT_HEIGHT, objectFit: 'cover', background: '#000' }}
              />
              <canvas
                ref={overlayRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
              />
            </div>

            {cameraError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '16px', background: 'rgba(15, 23, 42, 0.92)', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#fca5a5', fontWeight: 600, lineHeight: 1.5 }}>
                  {CAMERA_ERROR_MESSAGES[cameraError.kind] || CAMERA_ERROR_MESSAGES.unknown}
                </p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); retryCamera(); }}
                  style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                >
                  ลองใหม่
                </button>
              </div>
            )}
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
                width: '100%',
                boxSizing: 'border-box',
                animation: 'fadeIn 0.2s ease-in-out'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
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
                  <span style={{ fontSize: '12.5px', color: '#f8fafc', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {lastDetected.runner.name}
                    {lastDetected.runner.cat && (
                      <span style={{
                        background: (Array.isArray(categories) ? categories.find(c => c.id === lastDetected.runner.category_id || c.name === lastDetected.runner.cat)?.color : null) || '#3b82f6',
                        color: '#fff',
                        padding: '0px 7px',
                        borderRadius: '99px',
                        fontSize: '0.85em',
                        fontWeight: 700
                      }}>
                        {lastDetected.runner.cat}
                      </span>
                    )}
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
                    maxWidth: '220px', 
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

          {/* Bottom Zoom Bar */}
          <div style={{ background: '#1e293b', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid #334155', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <ZoomIn size={13} /> ซูม:
              </span>
              {/* Preset Zoom Buttons */}
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1, 1.5, 2, 2.5].map((z) => (
                  <button 
                    key={z} 
                    type="button"
                    onClick={() => applyZoom(z)}
                    style={{ 
                      padding: '2px 6px', 
                      fontSize: '11px', 
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
                style={{ flex: '1 1 50px', minWidth: '40px', maxWidth: '110px', accentColor: 'var(--start)', cursor: 'pointer' }} 
              />
              <span style={{ fontSize: '11px', color: '#cbd5e1', fontFamily: 'var(--mono)', minWidth: '30px' }}>
                {zoomLevel.toFixed(1)}x
              </span>
            </div>
          </div>

          <div style={{ padding: '6px 12px', background: '#0f172a', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
              💡 <b>สแกนทั้งภาพ:</b> เล็ง QR หรือบาร์โค้ดตรงไหนก็ได้ ระบบจะวาดกรอบสีเขียวเมื่อเจอ | แตะที่ภาพเพื่อโฟกัส | กด <b>1.5x / 2x</b> เพื่อสแกนจากระยะยืน
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
