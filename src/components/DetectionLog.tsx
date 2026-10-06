import React, { useState, useMemo } from 'react';
import { DetectionRecord } from '../types';
import {
  exportDetectionsCsv,
  exportDetectionsJson,
  updateDetectionStatus,
  deleteDetectionRecord,
  clearAllDetections,
  deduplicateStoredDetections,
} from '../lib/storage';
import {
  FileText,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Send,
  AlertCircle,
  Layers,
} from 'lucide-react';

interface DetectionLogProps {
  detections: DetectionRecord[];
  onRefresh: () => void;
  onFocusMap: (lat: number, lon: number) => void;
}

export const DetectionLog: React.FC<DetectionLogProps> = ({
  detections,
  onRefresh,
  onFocusMap,
}) => {
  const [minConfFilter, setMinConfFilter] = useState<number>(50); // Default >= 50%
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Map detection ID to survivor number based on full detections array
  const survivorNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    detections.forEach((d, i) => {
      map.set(d.id, i + 1);
    });
    return map;
  }, [detections]);

  const filtered = detections.filter((item) => {
    if (item.confidence < minConfFilter) return false;
    if (sourceFilter !== 'ALL' && item.source !== sourceFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const survNum = survivorNumberMap.get(item.id) ?? 0;
      const matchSurvNum =
        q === `#${survNum}` ||
        q === `${survNum}` ||
        q === `survivor ${survNum}` ||
        q === `survivor #${survNum}` ||
        `#${survNum}`.includes(q);

      const matchGrid = item.grid.toLowerCase().includes(q);
      const matchSource = item.source.toLowerCase().includes(q);
      const matchLat = item.lat?.toString().includes(q) || false;
      const matchLon = item.lon?.toString().includes(q) || false;
      const matchStatus = item.status.toLowerCase().includes(q);
      const matchNotes = item.notes?.toLowerCase().includes(q) || false;

      return matchSurvNum || matchGrid || matchSource || matchLat || matchLon || matchStatus || matchNotes;
    }

    return true;
  });

  const handleStatusChange = (id: string, newStatus: DetectionRecord['status']) => {
    updateDetectionStatus(id, newStatus);
    onRefresh();
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this detection record from permanent log?')) {
      deleteDetectionRecord(id);
      onRefresh();
    }
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to CLEAR ALL stored survivor detections? This cannot be undone.')) {
      clearAllDetections();
      onRefresh();
    }
  };

  return (
    <div id="detection-log" className="sheet mb-6 bg-white p-4 border border-[#173A5E]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#173A5E]/20 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#C5432E]" />
          <h3 className="font-disp text-lg uppercase tracking-wide text-[#173A5E] font-semibold">
            03 — Persistent SAR Human Survivor Log (&gt;50% Confidence)
          </h3>
          <span className="font-mono text-xs bg-[#173A5E] text-white px-2 py-0.5">
            {filtered.length} RECORDS
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            onClick={() => {
              deduplicateStoredDetections();
              onRefresh();
            }}
            disabled={detections.length === 0}
            className="border border-[#173A5E] bg-[#173A5E]/10 hover:bg-[#173A5E] hover:text-white px-2.5 py-1.5 flex items-center gap-1 transition disabled:opacity-40 font-semibold"
            title="Consolidate duplicate detections of the same survivor in close proximity"
          >
            <Layers className="w-3.5 h-3.5 text-[#C5432E]" />
            MERGE DUPLICATES
          </button>

          <button
            onClick={onRefresh}
            className="border border-[#173A5E] hover:bg-[#173A5E] hover:text-white px-2.5 py-1.5 flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            REFRESH
          </button>

          <button
            onClick={() => exportDetectionsCsv(filtered, survivorNumberMap)}
            disabled={filtered.length === 0}
            className="bg-[#173A5E] hover:bg-[#C5432E] text-white px-2.5 py-1.5 flex items-center gap-1 transition disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT CSV
          </button>

          <button
            onClick={() => exportDetectionsJson(filtered, survivorNumberMap)}
            disabled={filtered.length === 0}
            className="border border-[#173A5E] hover:bg-[#173A5E] hover:text-white px-2.5 py-1.5 flex items-center gap-1 transition disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>

          <button
            onClick={handleClearAll}
            disabled={detections.length === 0}
            className="border border-[#C5432E] text-[#C5432E] hover:bg-[#C5432E] hover:text-white px-2.5 py-1.5 flex items-center gap-1 transition disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            CLEAR LOG
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-[#F4F2EC] p-2.5 border border-[#173A5E]/20 mb-3 font-mono text-xs">
        <div className="flex items-center gap-1.5 text-[#5B6B7C]">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-semibold text-[#173A5E]">FILTERS:</span>
        </div>

        <label className="flex items-center gap-1 text-[#5B6B7C]">
          MIN CONFIDENCE:
          <select
            value={minConfFilter}
            onChange={(e) => setMinConfFilter(Number(e.target.value))}
            className="bg-white border border-[#173A5E] px-2 py-1 text-xs text-[#22303F]"
          >
            <option value={50}>≥ 50% (Standard SAR)</option>
            <option value={70}>≥ 70% (High Confidence)</option>
            <option value={85}>≥ 85% (Verified Lock)</option>
          </select>
        </label>

        <label className="flex items-center gap-1 text-[#5B6B7C]">
          SOURCE:
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-white border border-[#173A5E] px-2 py-1 text-xs text-[#22303F]"
          >
            <option value="ALL">All Feeds</option>
            <option value="LIVE WEBCAM">Live Webcam</option>
            <option value="DRONE STREAM">Drone Stream</option>
            <option value="IMAGE UPLOAD">Image Upload</option>
            <option value="VIDEO UPLOAD">Video Upload</option>
          </select>
        </label>

        <div className="ml-auto flex items-center gap-1 bg-white px-2 py-1 border border-[#173A5E]">
          <Search className="w-3.5 h-3.5 text-[#5B6B7C]" />
          <input
            type="text"
            placeholder="Search Survivor #, Lat, Lon, Grid, Notes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="outline-none text-xs text-[#22303F] w-56 font-mono"
          />
        </div>
      </div>

      {/* Log Table */}
      <div className="overflow-x-auto border border-[#173A5E]">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead>
            <tr className="bg-[#173A5E] text-white uppercase text-[11px]">
              <th className="p-2.5 border-r border-[#173A5E]/30 text-center w-24">SURVIVOR #</th>
              <th className="p-2.5 border-r border-[#173A5E]/30">TIMESTAMP</th>
              <th className="p-2.5 border-r border-[#173A5E]/30">SOURCE</th>
              <th className="p-2.5 border-r border-[#173A5E]/30">GRID / QUAD</th>
              <th className="p-2.5 border-r border-[#173A5E]/30">LATITUDE &amp; LONGITUDE</th>
              <th className="p-2.5 border-r border-[#173A5E]/30">RANGE</th>
              <th className="p-2.5 border-r border-[#173A5E]/30">CONF.</th>
              <th className="p-2.5 border-r border-[#173A5E]/30">RESCUE STATUS</th>
              <th className="p-2.5">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#173A5E]/20">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-[#5B6B7C] italic">
                  No detected human records matching the active filters (&gt;50% confidence).
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const survNum = survivorNumberMap.get(item.id) ?? 1;
                const dateStr = new Date(item.savedAt).toLocaleTimeString();
                const isRescued = item.status === 'Rescued';
                const isDispatched = item.status === 'Dispatched';
                const isFalsePos = item.status === 'False Positive';
                const badgeBg = isRescued
                  ? 'bg-[#3E7A5C]'
                  : isDispatched
                  ? 'bg-[#B8862B]'
                  : isFalsePos
                  ? 'bg-slate-400'
                  : 'bg-[#C5432E]';

                return (
                  <tr key={item.id} className="hover:bg-[#F4F2EC] transition">
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-center font-mono font-bold text-white text-xs px-2.5 py-1 rounded-xs shadow-xs ${badgeBg}`}
                        title={`Survivor #${survNum}`}
                      >
                        #{survNum}
                      </span>
                    </td>

                    <td className="p-2.5 font-semibold text-[#173A5E] whitespace-nowrap">
                      {dateStr}
                    </td>

                    <td className="p-2.5 whitespace-nowrap text-[11px] text-[#5B6B7C]">
                      {item.source}
                    </td>

                    <td className="p-2.5 whitespace-nowrap font-bold text-[#173A5E]">
                      {item.grid} ({item.quadrant})
                    </td>

                    <td className="p-2.5 whitespace-nowrap font-semibold">
                      {item.lat !== null && item.lon !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[#C5432E] font-mono">
                            {item.lat.toFixed(6)}, {item.lon.toFixed(6)}
                          </span>
                          <button
                            onClick={() => onFocusMap(item.lat!, item.lon!)}
                            title={`Center map on Survivor #${survNum}`}
                            className="text-[10px] bg-[#173A5E]/10 hover:bg-[#173A5E] text-[#173A5E] hover:text-white px-1.5 py-0.5 border border-[#173A5E]/20"
                          >
                            MAP #{survNum}
                          </button>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#173A5E] hover:text-[#C5432E]"
                            title="Open in Google Maps"
                          >
                            <ExternalLink className="w-3.5 h-3.5 inline" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-[#B8862B] italic text-[11px]">
                          Search Grid Ref (A1-C3)
                        </span>
                      )}
                    </td>

                    <td className="p-2.5 whitespace-nowrap text-[#5B6B7C]">
                      {item.distanceM !== null ? `~${item.distanceM}m` : '—'}
                    </td>

                    <td className="p-2.5 whitespace-nowrap">
                      <span className="font-bold text-[#173A5E] bg-[#173A5E]/10 px-1.5 py-0.5 border border-[#173A5E]/20">
                        {item.confidence}%
                      </span>
                    </td>

                    <td className="p-2.5 whitespace-nowrap">
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleStatusChange(item.id, e.target.value as DetectionRecord['status'])
                        }
                        className={`text-xs font-mono font-bold px-2 py-1 border outline-none cursor-pointer ${
                          item.status === 'Rescued'
                            ? 'bg-[#3E7A5C]/10 text-[#3E7A5C] border-[#3E7A5C]'
                            : item.status === 'Dispatched'
                            ? 'bg-[#B8862B]/10 text-[#B8862B] border-[#B8862B]'
                            : item.status === 'False Positive'
                            ? 'bg-slate-100 text-slate-500 border-slate-300'
                            : 'bg-[#C5432E]/10 text-[#C5432E] border-[#C5432E]'
                        }`}
                      >
                        <option value="Unverified">Unverified</option>
                        <option value="Dispatched">Team Dispatched</option>
                        <option value="Rescued">Rescued</option>
                        <option value="False Positive">False Positive</option>
                      </select>
                    </td>

                    <td className="p-2.5 whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-[#C5432E] hover:text-[#173A5E] p-1"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] font-mono text-[#5B6B7C]">
        * Detections stored locally in browser persistent memory. Each record captures bounding box center projection onto geographic surface coordinates when camera GPS reference is active.
      </div>
    </div>
  );
};
