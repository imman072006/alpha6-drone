import { DetectionRecord } from '../types';

const STORAGE_KEY = 'alpha6_human_detections';

/**
 * Checks if two detection records refer to the same physical survivor
 * based on exact ID, micro-GPS proximity (<1.5 meters), or tight screen position (<4%).
 * Distinct persons nearby (e.g. >2 meters or >4% screen apart) are kept separate.
 */
export function isSameSurvivor(a: DetectionRecord, b: DetectionRecord): boolean {
  if (!a || !b) return false;

  // 1. Exact ID match (same tracking ID)
  if (a.id === b.id) return true;

  // 2. Same feed source with tight spatial overlap (< 4% screen offset)
  if (
    a.source === b.source &&
    a.xPct !== undefined && a.xPct !== null &&
    b.xPct !== undefined && b.xPct !== null &&
    a.yPct !== undefined && a.yPct !== null &&
    b.yPct !== undefined && b.yPct !== null
  ) {
    const dx = Math.abs(a.xPct - b.xPct);
    const dy = Math.abs(a.yPct - b.yPct);
    if (dx < 4 && dy < 4) {
      return true;
    }
  }

  // 3. Micro GPS proximity check (< ~1.5 meters / 0.000015 deg) if both have precise Lat/Lon
  if (
    a.lat !== null && a.lat !== undefined &&
    a.lon !== null && a.lon !== undefined &&
    b.lat !== null && b.lat !== undefined &&
    b.lon !== null && b.lon !== undefined
  ) {
    const dLat = Math.abs(a.lat - b.lat);
    const dLon = Math.abs(a.lon - b.lon);
    if (dLat < 0.000015 && dLon < 0.000015) {
      return true;
    }
  }

  return false;
}

/**
 * Consolidates duplicate detections of the same survivor in a list.
 */
export function deduplicateDetectionsList(list: DetectionRecord[]): DetectionRecord[] {
  const result: DetectionRecord[] = [];

  for (const item of list) {
    const matchIndex = result.findIndex((existing) => isSameSurvivor(existing, item));

    if (matchIndex >= 0) {
      const existing = result[matchIndex];
      const newerTime =
        new Date(item.savedAt).getTime() > new Date(existing.savedAt).getTime()
          ? item.savedAt
          : existing.savedAt;

      result[matchIndex] = {
        ...existing,
        confidence: Math.max(existing.confidence, item.confidence),
        savedAt: newerTime,
        lat: item.lat ?? existing.lat,
        lon: item.lon ?? existing.lon,
        distanceM: item.distanceM ?? existing.distanceM,
        grid: item.grid || existing.grid,
        quadrant: item.quadrant || existing.quadrant,
        xPct: item.xPct ?? existing.xPct,
        yPct: item.yPct ?? existing.yPct,
        status: existing.status !== 'Unverified' ? existing.status : item.status,
        notes: existing.notes || item.notes,
      };
    } else {
      result.push({ ...item });
    }
  }

  return result.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

export function getStoredDetections(): DetectionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    const deduplicated = deduplicateDetectionsList(parsed);
    if (deduplicated.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
    }
    return deduplicated;
  } catch (e) {
    console.error('Failed to read stored detections:', e);
    return [];
  }
}

export function saveDetectionRecord(record: DetectionRecord): DetectionRecord[] {
  try {
    const current = getStoredDetections();
    const existingIndex = current.findIndex((item) => isSameSurvivor(item, record));
    
    let updated: DetectionRecord[];
    if (existingIndex >= 0) {
      const existing = current[existingIndex];
      updated = [...current];
      updated[existingIndex] = {
        ...existing,
        confidence: Math.max(existing.confidence, record.confidence),
        savedAt: record.savedAt,
        lat: record.lat ?? existing.lat,
        lon: record.lon ?? existing.lon,
        distanceM: record.distanceM ?? existing.distanceM,
        grid: record.grid || existing.grid,
        quadrant: record.quadrant || existing.quadrant,
        xPct: record.xPct ?? existing.xPct,
        yPct: record.yPct ?? existing.yPct,
        status: existing.status !== 'Unverified' ? existing.status : record.status,
        notes: existing.notes || record.notes,
      };
    } else {
      updated = [record, ...current];
    }

    const deduplicated = deduplicateDetectionsList(updated);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
    window.dispatchEvent(new Event('alpha6_detections_updated'));
    return deduplicated;
  } catch (e) {
    console.error('Failed to save detection record:', e);
    return getStoredDetections();
  }
}

export function deduplicateStoredDetections(): DetectionRecord[] {
  const current = getStoredDetections();
  const deduplicated = deduplicateDetectionsList(current);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
  window.dispatchEvent(new Event('alpha6_detections_updated'));
  return deduplicated;
}

export function updateDetectionStatus(
  id: string,
  status: DetectionRecord['status'],
  notes?: string
): DetectionRecord[] {
  try {
    const current = getStoredDetections();
    const updated = current.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          status,
          notes: notes !== undefined ? notes : item.notes,
        };
      }
      return item;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('alpha6_detections_updated'));
    return updated;
  } catch (e) {
    console.error('Failed to update detection status:', e);
    return getStoredDetections();
  }
}

export function deleteDetectionRecord(id: string): DetectionRecord[] {
  try {
    const current = getStoredDetections();
    const updated = current.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('alpha6_detections_updated'));
    return updated;
  } catch (e) {
    console.error('Failed to delete detection record:', e);
    return getStoredDetections();
  }
}

export function clearAllDetections(): DetectionRecord[] {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('alpha6_detections_updated'));
    return [];
  } catch (e) {
    console.error('Failed to clear detections:', e);
    return [];
  }
}

export function exportDetectionsCsv(
  detections: DetectionRecord[],
  survivorNumberMap?: Map<string, number>
) {
  const headers = [
    'Survivor_Number',
    'ID',
    'SavedAt',
    'Source',
    'GridCell',
    'Quadrant',
    'Latitude',
    'Longitude',
    'EstDistance_Meters',
    'Confidence_Percent',
    'Status',
    'Notes',
  ];

  const rows = detections.map((d, idx) => {
    const survNum = survivorNumberMap?.get(d.id) ?? idx + 1;
    return [
      `#${survNum}`,
      d.id,
      d.savedAt,
      d.source,
      d.grid,
      d.quadrant,
      d.lat ?? '',
      d.lon ?? '',
      d.distanceM ?? '',
      `${d.confidence}%`,
      d.status,
      d.notes || '',
    ];
  });

  const escapeCsv = (val: any) => {
    const str = String(val ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `alpha6_detected_humans_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDetectionsJson(
  detections: DetectionRecord[],
  survivorNumberMap?: Map<string, number>
) {
  const formatted = detections.map((d, idx) => ({
    survivorNumber: survivorNumberMap?.get(d.id) ?? idx + 1,
    survivorLabel: `#${survivorNumberMap?.get(d.id) ?? idx + 1}`,
    ...d,
  }));
  const jsonContent = JSON.stringify(formatted, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `alpha6_detected_humans_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Seed mock initial survivor detections if log is empty so user can immediately see
// stored latitude/longitude records and map pins upon load.
export function seedInitialDataIfEmpty(): DetectionRecord[] {
  const current = getStoredDetections();
  if (current.length > 0) return current;

  const mockLat = 13.0827;
  const mockLon = 80.2707;

  const sampleEntries: DetectionRecord[] = [
    {
      id: 'human_seed_001',
      savedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      source: 'DRONE STREAM',
      grid: 'B2',
      quadrant: 'upper-center',
      xPct: 48,
      yPct: 32,
      lat: parseFloat((mockLat + 0.00018).toFixed(6)),
      lon: parseFloat((mockLon + 0.00021).toFixed(6)),
      distanceM: 24,
      confidence: 94,
      status: 'Unverified',
      notes: 'Trapped under concrete roof slab near north wall',
    },
    {
      id: 'human_seed_002',
      savedAt: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
      source: 'LIVE WEBCAM',
      grid: 'C1',
      quadrant: 'lower-left',
      xPct: 22,
      yPct: 78,
      lat: parseFloat((mockLat - 0.00014).toFixed(6)),
      lon: parseFloat((mockLon + 0.00035).toFixed(6)),
      distanceM: 18,
      confidence: 88,
      status: 'Dispatched',
      notes: 'Waving for help in open courtyard debris',
    },
    {
      id: 'human_seed_003',
      savedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      source: 'IMAGE UPLOAD',
      grid: 'A3',
      quadrant: 'upper-right',
      xPct: 82,
      yPct: 24,
      lat: parseFloat((mockLat + 0.00032).toFixed(6)),
      lon: parseFloat((mockLon - 0.00018).toFixed(6)),
      distanceM: 35,
      confidence: 76,
      status: 'Rescued',
      notes: 'Extricated by Team Alpha',
    },
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleEntries));
  return sampleEntries;
}
