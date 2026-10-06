import { DetectionResult, ThermalOptions, ThermalPaletteMode } from '../types';

export function thermalPaletteColor(
  t: number,
  palette: ThermalPaletteMode = 'ironbow'
): [number, number, number] {
  let stops: [number, number, number, number][];

  switch (palette) {
    case 'whitehot':
      stops = [
        [0.0, 12, 14, 18],
        [0.3, 50, 55, 65],
        [0.6, 130, 138, 150],
        [0.85, 210, 218, 228],
        [1.0, 255, 255, 255],
      ];
      break;

    case 'blackhot':
      stops = [
        [0.0, 245, 248, 252],
        [0.3, 190, 195, 200],
        [0.6, 100, 105, 115],
        [0.85, 35, 40, 48],
        [1.0, 0, 0, 0],
      ];
      break;

    case 'rainbow':
      stops = [
        [0.0, 0, 0, 0],
        [0.2, 0, 80, 255],
        [0.4, 0, 210, 100],
        [0.6, 255, 220, 0],
        [0.8, 255, 0, 80],
        [1.0, 255, 255, 255],
      ];
      break;

    case 'lava':
      stops = [
        [0.0, 8, 4, 12],
        [0.3, 90, 10, 60],
        [0.6, 210, 60, 20],
        [0.85, 255, 160, 20],
        [1.0, 255, 250, 210],
      ];
      break;

    case 'arctic':
      stops = [
        [0.0, 5, 12, 35],
        [0.3, 15, 70, 130],
        [0.6, 30, 160, 200],
        [0.85, 150, 230, 220],
        [1.0, 255, 255, 255],
      ];
      break;

    case 'ironbow':
    default:
      stops = [
        [0.0, 10, 5, 30],
        [0.2, 50, 12, 110],
        [0.4, 160, 20, 70],
        [0.6, 230, 90, 20],
        [0.8, 255, 200, 30],
        [0.95, 255, 245, 180],
        [1.0, 255, 255, 250],
      ];
      break;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const span = b[0] - a[0] || 1;
      const k = (t - a[0]) / span;
      return [
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k),
        Math.round(a[3] + (b[3] - a[3]) * k),
      ];
    }
  }

  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

export function applyThermalEffect(
  ctx: CanvasRenderingContext2D,
  videoEl: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  preds: DetectionResult[],
  offscreenCanvasRef: { current: HTMLCanvasElement | null },
  options: ThermalOptions = {}
) {
  const palette = options.palette || 'ironbow';
  const heatSensitivity = options.heatSensitivity ?? 1.0;
  const contrast = options.contrast ?? 1.0;
  const edgeEnhance = options.edgeEnhancement ?? true;
  const noiseLevel = options.noiseLevel ?? 0.035;
  const showHUD = options.showHUD ?? true;

  const offW = 200;
  const offH = Math.max(1, Math.round(offW * (h / w)));

  if (!offscreenCanvasRef.current) {
    offscreenCanvasRef.current = document.createElement('canvas');
  }

  const off = offscreenCanvasRef.current;
  off.width = offW;
  off.height = offH;
  const offCtx = off.getContext('2d');
  if (!offCtx) return;

  offCtx.drawImage(videoEl, 0, 0, offW, offH);

  let imgData: ImageData;
  try {
    imgData = offCtx.getImageData(0, 0, offW, offH);
  } catch (e) {
    // Cross-origin frame fallback
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(videoEl, 0, 0, w, h);
    return;
  }

  const d = imgData.data;
  const n = offW * offH;

  // 1. Calculate luminance and warm hue weight
  const lum = new Float32Array(n);
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    // Standard perceived brightness
    const l = 0.299 * r + 0.587 * g + 0.114 * b;

    // Skin/Warm tone boost: Red higher than G and B indicates warm body/skin tone
    const warmBoost = Math.max(0, r - (g + b) / 2) * 0.35 * heatSensitivity;
    const effLum = Math.min(255, l + warmBoost);

    lum[p] = effLum;
    if (effLum < minLum) minLum = effLum;
    if (effLum > maxLum) maxLum = effLum;
  }

  const range = Math.max(1, maxLum - minLum);

  // 2. Heat bias field from person bounding boxes
  const heatBias = new Float32Array(n);
  const targetHotspots: Array<{ x: number; y: number; temp: string; class: string }> = [];

  if (preds && preds.length) {
    const sx = offW / w;
    const sy = offH / h;

    preds.forEach((pr) => {
      if (pr.class !== 'person') return;
      const [bx, by, bw, bh] = pr.bbox;
      const cx = (bx + bw / 2) * sx;
      const cy = (by + bh / 2) * sy;
      const rx = Math.max(2, (bw * sx) / 2);
      const ry = Math.max(2, (bh * sy) / 2);

      // Record hotspot location for HUD
      targetHotspots.push({
        x: bx + bw / 2,
        y: by + bh / 2,
        temp: (36.4 + Math.random() * 1.8).toFixed(1),
        class: pr.class,
      });

      for (let py = 0; py < offH; py++) {
        for (let px = 0; px < offW; px++) {
          const dx = (px - cx) / rx;
          const dy = (py - cy) / ry;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 2.5) {
            const falloff = Math.max(0, 1 - dist2 / 2.5);
            const idx = py * offW + px;
            const extraHeat = falloff * 0.75 * heatSensitivity;
            heatBias[idx] = Math.max(heatBias[idx], extraHeat);
          }
        }
      }
    });
  }

  // 3. Edge enhancement map for structural contours (Sobel-like high pass)
  const edgeMap = new Float32Array(n);
  if (edgeEnhance) {
    for (let py = 1; py < offH - 1; py++) {
      for (let px = 1; px < offW - 1; px++) {
        const idx = py * offW + px;
        const gx =
          lum[idx + 1] - lum[idx - 1] +
          2 * (lum[idx + offW + 1] - lum[idx + offW - 1]) +
          (lum[idx - offW + 1] - lum[idx - offW - 1]);
        const gy =
          lum[idx + offW] - lum[idx - offW] +
          2 * (lum[idx + offW + 1] - lum[idx - offW + 1]) +
          (lum[idx + offW - 1] - lum[idx - offW - 1]);
        const mag = Math.sqrt(gx * gx + gy * gy) / 1024; // Normalized 0..1
        edgeMap[idx] = mag;
      }
    }
  }

  // 4. Recolor image pixels
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let t = (lum[p] - minLum) / range;

    // Apply contrast stretch around midpoint 0.5
    t = (t - 0.5) * contrast + 0.5;

    // Add person body heat boost
    t += heatBias[p];

    // Add structural edge detail
    if (edgeEnhance) {
      t += edgeMap[p] * 0.22;
    }

    // Add thermal sensor grain
    if (noiseLevel > 0) {
      t += (Math.random() - 0.5) * noiseLevel;
    }

    t = Math.max(0, Math.min(1, t));

    const [r, g, b] = thermalPaletteColor(t, palette);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }

  offCtx.putImageData(imgData, 0, 0);

  // Render processed thermal image to main canvas
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'blur(1px)';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);
  ctx.filter = 'none';

  // 5. Render Thermal HUD & Telemetry
  if (showHUD) {
    renderThermalHUD(ctx, w, h, palette, heatSensitivity, targetHotspots);
  }
}

function renderThermalHUD(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: ThermalPaletteMode,
  heatSensitivity: number,
  targetHotspots: Array<{ x: number; y: number; temp: string; class: string }>
) {
  ctx.save();

  // Top Left Header Banner
  ctx.fillStyle = 'rgba(14, 26, 38, 0.75)';
  ctx.fillRect(10, 10, 240, 48);
  ctx.strokeStyle = '#3E6690';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 240, 48);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px "IBM Plex Mono", monospace';
  ctx.fillText('FLIR THERMAL IR-VISION v2.4', 18, 26);

  ctx.fillStyle = '#49D3E0';
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillText(
    `PALETTE: ${palette.toUpperCase()} | SENS: ${Math.round(heatSensitivity * 100)}%`,
    18,
42
  );

  // Top Right Status Indicator
  ctx.fillStyle = 'rgba(14, 26, 38, 0.75)';
  ctx.fillRect(w - 150, 10, 140, 28);
  ctx.strokeStyle = '#C5432E';
  ctx.strokeRect(w - 150, 10, 140, 28);

  // Pulsing dot
  ctx.fillStyle = '#C5432E';
  ctx.beginPath();
  ctx.arc(w - 138, 24, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 10px "IBM Plex Mono", monospace';
  ctx.fillText('THERMAL ACTIVE', w - 128, 28);

  // Thermal Temperature Gradient Colorbar (Right Side)
  const barW = 14;
  const barH = 140;
  const barX = w - 30;
  const barY = h / 2 - barH / 2;

  ctx.fillStyle = 'rgba(14, 26, 38, 0.8)';
  ctx.fillRect(barX - 45, barY - 15, barW + 55, barH + 30);
  ctx.strokeStyle = '#3E6690';
  ctx.strokeRect(barX - 45, barY - 15, barW + 55, barH + 30);

  // Draw gradient bar
  for (let i = 0; i < barH; i++) {
    const t = 1 - i / barH; // Top is max temp (1.0), bottom is min temp (0.0)
    const [r, g, b] = thermalPaletteColor(t, palette);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(barX, barY + i, barW, 1);
  }

  // Bar ticks and temperature labels
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '9px "IBM Plex Mono", monospace';

  const maxTemp = (37.5 + heatSensitivity * 1.5).toFixed(1);
  const minTemp = (16.0 - (heatSensitivity - 1) * 2).toFixed(1);

  ctx.fillText(`${maxTemp}°C`, barX - 40, barY + 8);
  ctx.fillText(`${minTemp}°C`, barX - 40, barY + barH);

  // Center Reticle (Spot temperature)
  if (targetHotspots.length === 0) {
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;

    // Crosshair
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText('(+) 22.8°C BG', cx + 15, cy + 4);
  } else {
    // Reticles over target hotspots
    targetHotspots.forEach((hs) => {
      ctx.strokeStyle = '#FFFAEE';
      ctx.lineWidth = 1.5;

      // Circle target lock
      ctx.beginPath();
      ctx.arc(hs.x, hs.y, 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(hs.x - 22, hs.y);
      ctx.lineTo(hs.x + 22, hs.y);
      ctx.moveTo(hs.x, hs.y - 22);
      ctx.lineTo(hs.x, hs.y + 22);
      ctx.stroke();

      // Temperature tag
      ctx.fillStyle = '#C5432E';
      ctx.fillRect(hs.x + 20, hs.y - 12, 65, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillText(`${hs.temp}°C IR`, hs.x + 24, hs.y + 1);
    });
  }

  ctx.restore();
}
