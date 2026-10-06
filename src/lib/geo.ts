import { GeoState } from '../types';

const EARTH_RADIUS_M = 6371000;
const GRID_COLS = 3;
const GRID_ROWS = 3;

export function gridCell(cx: number, cy: number, w: number, h: number) {
  const colIdx = Math.max(0, Math.min(GRID_COLS - 1, Math.floor((cx / w) * GRID_COLS)));
  const rowIdx = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((cy / h) * GRID_ROWS)));
  return { colIdx, rowIdx, ref: String.fromCharCode(65 + rowIdx) + (colIdx + 1) };
}

export interface EstimatedPosition {
  grid: string;
  quadrant: string;
  xPct: number;
  yPct: number;
  latLon: {
    lat: number;
    lon: number;
    distanceM: number;
  } | null;
}

export function estimateLatLon(
  bbox: [number, number, number, number],
  w: number,
  h: number,
  geoState: GeoState
): { lat: number; lon: number; distanceM: number } | null {
  if (geoState.lat == null || geoState.lon == null || geoState.heading == null) {
    return null;
  }

  const [x, y, bw, bh] = bbox;
  const cx = x + bw / 2;
  const bboxH = Math.max(1, bh);

  const hFovRad = (geoState.hFov * Math.PI) / 180;
  const vFovRad = hFovRad * (h / w); // approximate vertical FOV assuming square pixels
  const bearingOffsetRad = ((cx - w / 2) / (w / 2)) * (hFovRad / 2);
  const bearingRad =
    (((geoState.heading * Math.PI) / 180 + bearingOffsetRad) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  // Pinhole distance estimate: real height / apparent angular height
  const angularHeight = (bboxH / h) * vFovRad;
  let distanceM = angularHeight > 0.001 ? geoState.personHeightM / (2 * Math.tan(angularHeight / 2)) : null;

  if (distanceM == null || !isFinite(distanceM) || distanceM <= 0) {
    return null;
  }

  // Clamp implausible long-range guesses to 500m max
  distanceM = Math.min(distanceM, 500);

  const lat1 = (geoState.lat * Math.PI) / 180;
  const lon1 = (geoState.lon * Math.PI) / 180;
  const d = distanceM / EARTH_RADIUS_M;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  const latDeg = (lat2 * 180) / Math.PI;
  const lonDeg = (((lon2 * 180) / Math.PI + 540) % 360) - 180;

  return {
    lat: parseFloat(latDeg.toFixed(6)),
    lon: parseFloat(lonDeg.toFixed(6)),
    distanceM: Math.round(distanceM),
  };
}

export function positionInfo(
  bbox: [number, number, number, number],
  w: number,
  h: number,
  geoState: GeoState
): EstimatedPosition {
  const [x, y, bw, bh] = bbox;
  const cx = x + bw / 2;
  const cy = y + bh / 2;
  const xPct = Math.round((cx / w) * 100);
  const yPct = Math.round((cy / h) * 100);

  const colFrac = cx / w;
  const rowFrac = cy / h;
  const col = colFrac < 0.34 ? 'left' : colFrac < 0.67 ? 'center' : 'right';
  const row = rowFrac < 0.34 ? 'upper' : rowFrac < 0.67 ? 'mid' : 'lower';
  const { ref } = gridCell(cx, cy, w, h);

  const latLon = estimateLatLon(bbox, w, h, geoState);

  return {
    grid: ref,
    quadrant: `${row}-${col}`,
    xPct,
    yPct,
    latLon,
  };
}

export function drawSearchGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;

  for (let c = 1; c < GRID_COLS; c++) {
    const x = Math.round((w / GRID_COLS) * c) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  for (let r = 1; r < GRID_ROWS; r++) {
    const y = Math.round((h / GRID_ROWS) * r) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const label = String.fromCharCode(65 + r) + (c + 1);
      ctx.fillText(label, (w / GRID_COLS) * c + 6, (h / GRID_ROWS) * r + 14);
    }
  }
  ctx.restore();
}
