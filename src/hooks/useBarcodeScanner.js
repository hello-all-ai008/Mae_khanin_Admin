import { useCallback, useEffect, useRef, useState } from 'react';
import { createDetector, resetPonyfill, scaleDetection } from '../lib/scanner/detector';
import { INITIAL_ZOOM_VIEW, resolveZoomOutcome, startZoomView } from '../lib/scanner/zoom';
import { createScanConfirmer, pickBestDetection } from '../lib/scanner/confirm';
import {
  applyContinuousModes,
  applyHardwareZoom,
  classifyCameraError,
  focusAtPoint,
  getVideoTrack,
  getZoomRange,
  openStream,
  setTorch as setTrackTorch,
  stopStream,
  supportsTorch,
} from '../lib/scanner/camera';
import {
  HIGHLIGHT_FADE_MS,
  clearOverlay,
  drawHighlight,
  syncOverlaySize,
} from '../lib/scanner/overlay';

const MIN_DETECT_INTERVAL_MS = 100;
const MAX_DECODE_EDGE_PX = 1280;
const VIDEO_HAVE_CURRENT_DATA = 2;
const MAX_CONSECUTIVE_DETECT_ERRORS = 5;

/**
 * Camera + continuous barcode detection.
 * @param {{
 *   enabled: boolean,
 *   facingMode: string,
 *   videoRef: { current: HTMLVideoElement | null },
 *   overlayRef: { current: HTMLCanvasElement | null },
 *   onDetect: (rawValue: string) => void,
 * }} options
 */
export function useBarcodeScanner({ enabled, facingMode, videoRef, overlayRef, onDetect }) {
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [supportsTorchState, setSupportsTorchState] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [zoomView, setZoomView] = useState(INITIAL_ZOOM_VIEW);
  const [retryToken, setRetryToken] = useState(0);

  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const trackRef = useRef(null);
  const zoomRef = useRef(1);
  const hardwareZoomRef = useRef(1);
  const zoomRequestRef = useRef(0);
  const detectorRef = useRef(null);

  // Hardware zoom first; on failure fall back to CSS scale relative to the hardware level in effect.
  // Only the latest request, and only for the track it was issued on, may commit its result.
  const commitZoom = useCallback(async (track, level) => {
    zoomRequestRef.current += 1;
    const requestId = zoomRequestRef.current;
    const applied = await applyHardwareZoom(track, level);
    if (track !== trackRef.current || requestId !== zoomRequestRef.current) return;

    const view = resolveZoomOutcome({ requested: level, applied, hardwareCurrent: hardwareZoomRef.current });
    hardwareZoomRef.current = view.hardwareZoom;
    zoomRef.current = view.displayZoom;
    setZoomView(view);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let session = 0;
    let stream = null;
    let loopHandle = null;
    let fadeTimer = null;
    const confirmer = createScanConfirmer();
    const offscreen = document.createElement('canvas');

    const stopLoop = () => {
      session += 1;
      const video = videoRef.current;
      if (loopHandle !== null) {
        if (video?.cancelVideoFrameCallback && loopHandle.type === 'video') {
          video.cancelVideoFrameCallback(loopHandle.id);
        } else if (loopHandle.type === 'raf') {
          cancelAnimationFrame(loopHandle.id);
        }
        loopHandle = null;
      }
      clearTimeout(fadeTimer);
    };

    const release = () => {
      stopLoop();
      stopStream(stream);
      stream = null;
      trackRef.current = null;
      clearOverlay(overlayRef.current);
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsReady(false);
      setIsTorchOn(false);
    };

    const grabSource = (video, kind) => {
      if (kind === 'native') return { source: video, factor: 1 };
      const longEdge = Math.max(video.videoWidth, video.videoHeight);
      const downscale = Math.min(1, MAX_DECODE_EDGE_PX / longEdge);
      offscreen.width = Math.round(video.videoWidth * downscale);
      offscreen.height = Math.round(video.videoHeight * downscale);
      offscreen.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, offscreen.width, offscreen.height);
      return { source: offscreen, factor: video.videoWidth / offscreen.width };
    };

    const startLoop = (initial) => {
      const mySession = session;
      let active = initial;
      let inFlight = false;
      let lastRun = 0;
      let errorStreak = 0;

      // After repeated detect() failures: native -> ponyfill, ponyfill -> decoder error.
      const recoverFromErrors = async () => {
        if (active.kind === 'native') {
          console.warn('Native BarcodeDetector keeps failing, switching to the wasm decoder');
          try {
            const fallback = await createDetector({ nativeCtor: null });
            if (mySession !== session) return;
            detectorRef.current = fallback;
            active = fallback;
            errorStreak = 0;
          } catch (err) {
            console.error('Barcode decoder load failed:', err);
            if (mySession !== session) return;
            release();
            setError({ kind: 'decoder' });
          }
          return;
        }
        // The ponyfill itself is broken (wasm abort / OOM): drop it so retry loads a fresh one
        detectorRef.current = null;
        await resetPonyfill();
        if (mySession !== session) return;
        release();
        setError({ kind: 'decoder' });
      };

      const schedule = () => {
        const video = videoRef.current;
        if (!video || mySession !== session) return;
        loopHandle = video.requestVideoFrameCallback
          ? { type: 'video', id: video.requestVideoFrameCallback(tick) }
          : { type: 'raf', id: requestAnimationFrame(tick) };
      };

      const handleResults = (results, video) => {
        const best = pickBestDetection(results, video.videoWidth, video.videoHeight);
        if (!best) return;
        drawHighlight(overlayRef.current, best.cornerPoints);
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => clearOverlay(overlayRef.current), HIGHLIGHT_FADE_MS);
        const confirmed = confirmer.push(best);
        if (confirmed) onDetectRef.current?.(confirmed.rawValue);
      };

      async function tick() {
        const video = videoRef.current;
        if (!video || mySession !== session) return;
        const now = performance.now();
        const ready = video.readyState >= VIDEO_HAVE_CURRENT_DATA && video.videoWidth > 0;
        if (inFlight || !ready || now - lastRun < MIN_DETECT_INTERVAL_MS) {
          schedule();
          return;
        }
        lastRun = now;
        inFlight = true;
        try {
          syncOverlaySize(overlayRef.current, video.videoWidth, video.videoHeight);
          const { source, factor } = grabSource(video, active.kind);
          const raw = await active.detector.detect(source);
          if (mySession !== session) return;
          errorStreak = 0;
          const results = factor === 1 ? raw : raw.map((d) => scaleDetection(d, factor));
          handleResults(results, video);
        } catch (err) {
          if (mySession !== session) return;
          errorStreak += 1;
          if (errorStreak === 1) console.warn('Barcode detect failed:', err);
          if (errorStreak >= MAX_CONSECUTIVE_DETECT_ERRORS) {
            await recoverFromErrors();
            if (mySession !== session) return;
          }
        } finally {
          inFlight = false;
        }
        schedule();
      }

      schedule();
    };

    const start = async () => {
      const mySession = (session += 1);
      setError(null);
      try {
        const opened = await openStream(facingMode);
        if (mySession !== session) {
          stopStream(opened);
          return;
        }
        stream = opened;
      } catch (err) {
        console.error('Camera start failed:', err);
        if (mySession === session) setError({ kind: classifyCameraError(err) });
        return;
      }

      const video = videoRef.current;
      if (!video) {
        release();
        return;
      }
      video.srcObject = stream;
      video.play().catch((err) => console.warn('video.play() rejected:', err));

      const track = getVideoTrack(stream);
      trackRef.current = track;
      setSupportsTorchState(supportsTorch(track));
      hardwareZoomRef.current = 1;
      zoomRequestRef.current += 1;
      setZoomView(startZoomView({ displayZoom: zoomRef.current, hasRange: Boolean(getZoomRange(track)) }));
      applyContinuousModes(track);
      if (zoomRef.current > 1) commitZoom(track, zoomRef.current);

      try {
        if (!detectorRef.current) detectorRef.current = await createDetector();
      } catch (err) {
        console.error('Barcode decoder load failed:', err);
        if (mySession === session) {
          release();
          setError({ kind: 'decoder' });
        }
        return;
      }
      if (mySession !== session) return;

      setIsReady(true);
      startLoop(detectorRef.current);
    };

    const handleVisibility = () => {
      if (document.hidden) release();
      else start();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    start();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      release();
    };
  }, [enabled, facingMode, retryToken, videoRef, overlayRef, commitZoom]);

  const toggleTorch = useCallback(async () => {
    const next = !isTorchOn;
    const ok = await setTrackTorch(trackRef.current, next);
    if (ok) setIsTorchOn(next);
  }, [isTorchOn]);

  const setZoom = useCallback(async (level) => {
    zoomRef.current = level;
    setZoomView((prev) => ({ ...prev, displayZoom: level }));
    await commitZoom(trackRef.current, level);
  }, [commitZoom]);

  const focusAt = useCallback((x, y) => focusAtPoint(trackRef.current, x, y), []);
  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  return {
    error,
    isReady,
    supportsTorch: supportsTorchState,
    isTorchOn,
    toggleTorch,
    // Level shown in the UI; matches what the picture really shows
    zoomLevel: zoomView.displayZoom,
    hasHardwareZoom: zoomView.hasHardwareZoom,
    // CSS scale to apply on top of whatever hardware zoom is actually in effect
    cssZoom: zoomView.cssZoom,
    setZoom,
    focusAt,
    retry,
  };
}
