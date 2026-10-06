export interface DetectionRecord {
  id: string;
  savedAt: string;
  source: 'LIVE WEBCAM' | 'DRONE STREAM' | 'IMAGE UPLOAD' | 'VIDEO UPLOAD';
  grid: string; // e.g. "B2"
  quadrant: string; // e.g. "upper-center"
  xPct: number;
  yPct: number;
  lat: number | null;
  lon: number | null;
  distanceM: number | null;
  confidence: number; // 0 - 100
  status: 'Unverified' | 'Dispatched' | 'Rescued' | 'False Positive';
  notes?: string;
  bbox?: [number, number, number, number];
}

export interface GeoState {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  heading: number | null; // 0 - 359 degrees
  hFov: number; // horizontal field of view in degrees (default 60)
  personHeightM: number; // assumed adult height in meters (default 1.7)
}

export interface DamageAssessment {
  disaster_type: 'earthquake' | 'flood' | 'fire' | 'storm_hurricane' | 'landslide' | 'explosion' | 'building_collapse_other';
  disaster_subtype: string;
  damage_severity: 'undamaged' | 'minor' | 'moderate' | 'severe' | 'destroyed' | 'unknown';
  structural_collapse_level: 'none' | 'partial' | 'full' | 'n/a';
  hazards: string[];
  rubble_type: 'concrete' | 'wood' | 'mixed' | 'none' | 'n/a';
  humans_visible: number | null;
  confidence: number | null; // 0 - 1
  notes: string;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface DetectionResult {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
}

export type ThermalPaletteMode =
  | 'ironbow'
  | 'whitehot'
  | 'blackhot'
  | 'rainbow'
  | 'lava'
  | 'arctic';

export interface ThermalOptions {
  palette?: ThermalPaletteMode;
  heatSensitivity?: number; // 0.5 to 2.0
  contrast?: number;        // 0.5 to 2.0
  edgeEnhancement?: boolean;
  noiseLevel?: number;      // 0 to 0.1
  showHUD?: boolean;
}
