import { DetectionResult } from '../types';

export const CONFIRM_FRAMES = 2;
export const TRACK_TIMEOUT_MS = 3500; // 3.5s track persistence
export const RESAVE_INTERVAL_MS = 8000;
export const MATCH_DIST_FRAC = 0.12; // ~12% screen diagonal threshold so nearby distinct persons get separate tracking IDs
export const DETECT_MIN_SCORE = 0.5; // >50% threshold
export const SAVE_MIN_SCORE = 0.5;   // >50% threshold for storing

export interface Track {
  id: string;
  cx: number;
  cy: number;
  framesSeen: number;
  lastSeen: number;
  confirmed: boolean;
  lastSaveTime: number;
  lastScore: number;
  frozenPos?: any;
}

export interface TrackerState {
  tracks: Track[];
}

export function makeTracker(): TrackerState {
  return { tracks: [] };
}

export function updateTracker(
  tracker: TrackerState,
  humanPreds: DetectionResult[],
  w: number,
  h: number
): { pred: DetectionResult; track: Track; isNewConfirm: boolean }[] {
  const now = performance.now();
  const diag = Math.hypot(w, h);
  const maxDist = diag * MATCH_DIST_FRAC;
  const unmatched = new Set(tracker.tracks.map((t) => t.id));
  const results: { pred: DetectionResult; track: Track; isNewConfirm: boolean }[] = [];

  humanPreds.forEach((p) => {
    const [x, y, bw, bh] = p.bbox;
    const cx = x + bw / 2;
    const cy = y + bh / 2;
    let best: Track | null = null;
    let bestDist = Infinity;

    tracker.tracks.forEach((t) => {
      if (!unmatched.has(t.id)) return;
      const d = Math.hypot(t.cx - cx, t.cy - cy);
      if (d < maxDist && d < bestDist) {
        best = t;
        bestDist = d;
      }
    });

    if (best) {
      (best as Track).cx = cx;
      (best as Track).cy = cy;
      (best as Track).lastSeen = now;
      (best as Track).framesSeen++;
      (best as Track).lastScore = p.score;
      unmatched.delete((best as Track).id);
      results.push({ pred: p, track: best as Track, isNewConfirm: false });
    } else {
      const t: Track = {
        id: 'track_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        cx,
        cy,
        framesSeen: 1,
        lastSeen: now,
        confirmed: false,
        lastSaveTime: 0,
        lastScore: p.score,
      };
      tracker.tracks.push(t);
      results.push({ pred: p, track: t, isNewConfirm: false });
    }
  });

  tracker.tracks = tracker.tracks.filter((t) => now - t.lastSeen < TRACK_TIMEOUT_MS);
  return results;
}
