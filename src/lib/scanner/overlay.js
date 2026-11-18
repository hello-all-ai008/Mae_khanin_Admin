// Overlay drawing in intrinsic video pixels. The canvas must share the
// video's object-fit so these coordinates line up with the picture.

export const HIGHLIGHT_COLOR = '#22c55e';
export const HIGHLIGHT_FADE_MS = 600;
const GUIDE_COLOR = 'rgba(255, 255, 255, 0.55)';
const LINE_WIDTH_RATIO = 0.006;
const GUIDE_SIZE_RATIO = 0.6;
const GUIDE_BRACKET_RATIO = 0.08;

export function clearOverlay(canvas) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGuide(canvas);
}

export function syncOverlaySize(canvas, width, height) {
  if (!canvas || !width || !height) return;
  if (canvas.width === width && canvas.height === height) return;
  // Resizing wipes the bitmap, so only do it when the dimensions really change.
  canvas.width = width;
  canvas.height = height;
  clearOverlay(canvas);
}

export function drawHighlight(canvas, cornerPoints) {
  const ctx = canvas?.getContext('2d');
  if (!ctx || !cornerPoints || cornerPoints.length < 3) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGuide(canvas);
  ctx.lineWidth = Math.max(3, Math.min(canvas.width, canvas.height) * LINE_WIDTH_RATIO);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = HIGHLIGHT_COLOR;
  ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
  ctx.beginPath();
  cornerPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Purely visual center brackets; detection is never restricted to them. */
export function drawGuide(canvas) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const boxW = width * GUIDE_SIZE_RATIO;
  const boxH = height * GUIDE_SIZE_RATIO;
  const x = (width - boxW) / 2;
  const y = (height - boxH) / 2;
  const arm = Math.min(boxW, boxH) * GUIDE_BRACKET_RATIO;

  ctx.lineWidth = Math.max(3, Math.min(width, height) * LINE_WIDTH_RATIO);
  ctx.lineCap = 'round';
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.beginPath();
  [
    [x, y, 1, 1],
    [x + boxW, y, -1, 1],
    [x, y + boxH, 1, -1],
    [x + boxW, y + boxH, -1, -1],
  ].forEach(([cx, cy, dx, dy]) => {
    ctx.moveTo(cx + dx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * arm);
  });
  ctx.stroke();
}
