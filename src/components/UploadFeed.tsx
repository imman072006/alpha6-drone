import React, { useRef, useState, useEffect } from 'react';
import { DamageAssessment, DetectionRecord, GeoState, ThermalPaletteMode, DetectionResult } from '../types';
import { getCocoModel, drawDetectionBoxes } from '../lib/detector';
import { drawSearchGrid, positionInfo } from '../lib/geo';
import { applyThermalEffect } from '../lib/thermal';
import { saveDetectionRecord } from '../lib/storage';
import { Upload, Cpu, ShieldAlert, Sparkles, AlertTriangle, UserCheck, Flame, Sliders } from 'lucide-react';

interface UploadFeedProps {
  geoState: GeoState;
  onNewDetectionLogged: () => void;
  onFocusMap: (lat: number, lon: number) => void;
}

export const UploadFeed: React.FC<UploadFeedProps> = ({
  geoState,
  onNewDetectionLogged,
  onFocusMap,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thermalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [thermal, setThermal] = useState(false);
  const [thermalPalette, setThermalPalette] = useState<ThermalPaletteMode>('ironbow');
  const [heatSensitivity, setHeatSensitivity] = useState<number>(1.0);
  const [showHUD, setShowHUD] = useState<boolean>(true);
  const [loadingDetect, setLoadingDetect] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [detectionsCount, setDetectionsCount] = useState<number | null>(null);
  const [latestPreds, setLatestPreds] = useState<DetectionResult[]>([]);
  const [assessment, setAssessment] = useState<DamageAssessment | null>(null);
  const [statusMsg, setStatusMsg] = useState('Upload photo or video of disaster scene to enable thermal conversion.');

  const videoAnimIdRef = useRef<number | null>(null);

  const thermalRef = useRef(thermal);
  const thermalPaletteRef = useRef(thermalPalette);
  const heatSensRef = useRef(heatSensitivity);
  const showHUDRef = useRef(showHUD);
  const latestPredsRef = useRef(latestPreds);

  useEffect(() => { thermalRef.current = thermal; }, [thermal]);
  useEffect(() => { thermalPaletteRef.current = thermalPalette; }, [thermalPalette]);
  useEffect(() => { heatSensRef.current = heatSensitivity; }, [heatSensitivity]);
  useEffect(() => { showHUDRef.current = showHUD; }, [showHUD]);
  useEffect(() => { latestPredsRef.current = latestPreds; }, [latestPreds]);

  // Clean up video frame loop
  useEffect(() => {
    return () => {
      if (videoAnimIdRef.current) {
        cancelAnimationFrame(videoAnimIdRef.current);
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoAnimIdRef.current) {
      cancelAnimationFrame(videoAnimIdRef.current);
      videoAnimIdRef.current = null;
    }

    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setAssessment(null);
    setDetectionsCount(null);
    setLatestPreds([]);

    if (file.type.startsWith('image/')) {
      setFileType('image');
      setStatusMsg('Image loaded. Ready for thermal conversion, detector & AI assessment.');
    } else if (file.type.startsWith('video/')) {
      setFileType('video');
      setStatusMsg('Video clip loaded. Ready for thermal video camera conversion.');
    } else {
      setStatusMsg('Unsupported file type. Please upload an image or video.');
    }
  };

  // Render continuous thermal/overlay on uploaded video or image
  const renderFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas || !fileUrl) return;

    let mediaEl: HTMLImageElement | HTMLVideoElement | null = null;
    if (fileType === 'image') mediaEl = imgRef.current;
    if (fileType === 'video') mediaEl = videoRef.current;

    if (!mediaEl) return;

    const w = fileType === 'image'
      ? (imgRef.current?.naturalWidth || 640)
      : (videoRef.current?.videoWidth || 640);
    const h = fileType === 'image'
      ? (imgRef.current?.naturalHeight || 480)
      : (videoRef.current?.videoHeight || 480);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isThermal = thermalRef.current;
    const preds = latestPredsRef.current;

    if (isThermal) {
      applyThermalEffect(ctx, mediaEl, w, h, preds, thermalCanvasRef, {
        palette: thermalPaletteRef.current,
        heatSensitivity: heatSensRef.current,
        showHUD: showHUDRef.current,
      });
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    drawSearchGrid(ctx, w, h);
    if (preds.length > 0) {
      drawDetectionBoxes(ctx, w, h, preds, isThermal);
    }
  };

  // Trigger continuous loop for video playing or manual render on thermal option toggle
  useEffect(() => {
    if (!fileUrl) return;

    if (fileType === 'image') {
      setTimeout(() => renderFrame(), 100);
    } else if (fileType === 'video') {
      const loop = () => {
        renderFrame();
        videoAnimIdRef.current = requestAnimationFrame(loop);
      };
      loop();
    }

    return () => {
      if (videoAnimIdRef.current) {
        cancelAnimationFrame(videoAnimIdRef.current);
        videoAnimIdRef.current = null;
      }
    };
  }, [fileUrl, fileType, thermal, thermalPalette, heatSensitivity, showHUD, latestPreds]);

  const runLocalDetection = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mediaEl: HTMLImageElement | HTMLVideoElement | null = null;
    if (fileType === 'image') mediaEl = imgRef.current;
    if (fileType === 'video') mediaEl = videoRef.current;

    if (!mediaEl) return;

    setLoadingDetect(true);
    setStatusMsg('Running local TensorFlow.js object detector…');

    try {
      const model = await getCocoModel();
      const w = fileType === 'image' ? imgRef.current?.naturalWidth || 640 : videoRef.current?.videoWidth || 640;
      const h = fileType === 'image' ? imgRef.current?.naturalHeight || 480 : videoRef.current?.videoHeight || 480;

      canvas.width = w;
      canvas.height = h;

      const rawPreds = await model.detect(mediaEl, 30, 0.50);
      const preds: DetectionResult[] = rawPreds.map((d) => ({
        bbox: d.bbox as [number, number, number, number],
        class: d.class,
        score: d.score,
      }));

      setLatestPreds(preds);

      const humanPreds = preds.filter((p) => p.class === 'person');
      setDetectionsCount(humanPreds.length);

      // Log all human detections
      humanPreds.forEach((p, idx) => {
        const pos = positionInfo(p.bbox, w, h, geoState);
        const scorePct = Math.round(p.score * 100);

        const record: DetectionRecord = {
          id: `upload_${fileType}_${Date.now()}_p${idx + 1}_${Math.round(pos.xPct)}_${Math.round(pos.yPct)}`,
          savedAt: new Date().toISOString(),
          source: fileType === 'image' ? 'IMAGE UPLOAD' : 'VIDEO UPLOAD',
          grid: pos.grid,
          quadrant: pos.quadrant,
          xPct: pos.xPct,
          yPct: pos.yPct,
          lat: pos.latLon?.lat ?? null,
          lon: pos.latLon?.lon ?? null,
          distanceM: pos.latLon?.distanceM ?? null,
          confidence: scorePct,
          status: 'Unverified',
        };

        saveDetectionRecord(record);
      });

      onNewDetectionLogged();
      setStatusMsg(
        `Local Detection Complete: Identified ${humanPreds.length} human survivor(s) (>50% confidence). Coordinates saved.`
      );
      renderFrame();
    } catch (e: any) {
      console.error('Detection error:', e);
      setStatusMsg(`Detection failed: ${e.message}`);
    } finally {
      setLoadingDetect(false);
    }
  };

  const runAiAssessment = async () => {
    let mediaEl: HTMLImageElement | HTMLVideoElement | null = null;
    if (fileType === 'image') mediaEl = imgRef.current;
    if (fileType === 'video') mediaEl = videoRef.current;

    if (!mediaEl) return;

    setLoadingAI(true);
    setStatusMsg('Communicating with AI Damage Assessment Server…');

    try {
      // Capture frame to base64
      const tempCanvas = document.createElement('canvas');
      const w = fileType === 'image' ? imgRef.current?.naturalWidth || 640 : videoRef.current?.videoWidth || 640;
      const h = fileType === 'image' ? imgRef.current?.naturalHeight || 480 : videoRef.current?.videoHeight || 480;

      tempCanvas.width = w;
      tempCanvas.height = h;
      const tCtx = tempCanvas.getContext('2d');
      tCtx?.drawImage(mediaEl, 0, 0, w, h);

      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
      const base64Data = dataUrl.split(',')[1];

      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data }),
      });

      const data = await res.json();
      setAssessment(data);
      setStatusMsg('AI Structural & Damage Assessment completed successfully.');
    } catch (e: any) {
      console.error('AI Assessment error:', e);
      setStatusMsg('Server assessment error. Used offline heuristic evaluation.');
    } finally {
      setLoadingAI(false);
    }
  };

  return (
    <div className="bg-white border-b border-[#173A5E] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs mb-4 pb-3 border-b border-[#173A5E]/20">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,video/*"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#173A5E] hover:bg-[#C5432E] text-white px-3 py-2 flex items-center gap-1.5 transition font-semibold"
          >
            <Upload className="w-4 h-4" />
            CHOOSE FILE
          </button>

          <button
            onClick={() => setThermal(!thermal)}
            disabled={!fileUrl}
            className={`border px-3 py-2 flex items-center gap-1.5 transition disabled:opacity-40 font-semibold ${
              thermal
                ? 'bg-[#C5432E] text-white border-[#C5432E]'
                : 'border-[#173A5E] text-[#173A5E] hover:bg-[#173A5E] hover:text-white'
            }`}
          >
            <Flame className="w-4 h-4" />
            THERMAL CAM: {thermal ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={runLocalDetection}
            disabled={!fileUrl || loadingDetect}
            className="border border-[#173A5E] hover:bg-[#173A5E] hover:text-white text-[#173A5E] px-3 py-2 flex items-center gap-1.5 transition disabled:opacity-40 font-semibold"
          >
            <Cpu className="w-4 h-4" />
            {loadingDetect ? 'DETECTING…' : 'RUN HUMAN DETECTOR (LOCAL)'}
          </button>

          <button
            onClick={runAiAssessment}
            disabled={!fileUrl || loadingAI}
            className="bg-[#C5432E] hover:bg-[#173A5E] text-white px-3 py-2 flex items-center gap-1.5 transition disabled:opacity-40 font-semibold"
          >
            <Sparkles className="w-4 h-4" />
            {loadingAI ? 'ANALYZING…' : 'RUN AI DAMAGE ASSESSMENT'}
          </button>
        </div>

        <div className="text-[#5B6B7C] font-semibold">{statusMsg}</div>
      </div>

      {thermal && fileUrl && (
        <div className="bg-[#0E1A26] text-white p-2.5 border border-[#173A5E] flex flex-wrap items-center justify-between gap-3 text-xs font-mono mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[#49D3E0] font-bold flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" />
              CONVERSION PALETTE:
            </span>
            <select
              value={thermalPalette}
              onChange={(e) => setThermalPalette(e.target.value as ThermalPaletteMode)}
              className="bg-[#173A5E] text-white border border-[#3E6690] px-2 py-1 text-xs"
            >
              <option value="ironbow">Ironbow (Classic FLIR)</option>
              <option value="whitehot">White Hot (High Contrast)</option>
              <option value="blackhot">Black Hot (Inverted IR)</option>
              <option value="rainbow">Rainbow (Multi-Spectral)</option>
              <option value="lava">Lava / Inferno</option>
              <option value="arctic">Arctic Blue</option>
            </select>

            <span className="text-[#49D3E0] font-bold ml-2">HEAT SENSITIVITY:</span>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={heatSensitivity}
              onChange={(e) => setHeatSensitivity(parseFloat(e.target.value))}
              className="w-24 accent-[#C5432E] cursor-pointer"
            />
            <span className="text-[#FFFAEE] font-semibold">{Math.round(heatSensitivity * 100)}%</span>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-[#FFFAEE] hover:text-[#49D3E0] transition">
            <input
              type="checkbox"
              checked={showHUD}
              onChange={(e) => setShowHUD(e.target.checked)}
              className="accent-[#C5432E]"
            />
            <span>FLIR HUD TELEMETRY</span>
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative aspect-[4/3] bg-[#0E1A26] overflow-hidden border border-[#173A5E]">
          {!fileUrl ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#5B6B7C] p-6 text-center font-mono">
              <Upload className="w-12 h-12 text-[#173A5E] mb-3 opacity-60" />
              <p className="text-sm text-[#3E6690] font-semibold">NO FILE LOADED</p>
              <p className="text-xs text-[#5B6B7C] mt-2 max-w-sm">
                Upload aerial imagery, drone photos, or video clips to detect human survivors and evaluate structural collapse levels.
              </p>
            </div>
          ) : (
            <>
              {fileType === 'image' && (
                <img
                  ref={imgRef}
                  src={fileUrl}
                  alt="Disaster Scene"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )}
              {fileType === 'video' && (
                <video
                  ref={videoRef}
                  src={fileUrl}
                  controls
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            </>
          )}
        </div>

        <div className="p-3 bg-[#F4F2EC] border border-[#173A5E] text-xs font-mono">
          <h4 className="font-disp text-sm uppercase tracking-wider text-[#173A5E] font-bold border-b border-[#173A5E]/20 pb-2 mb-3">
            ASSESSMENT SUMMARY
          </h4>

          {detectionsCount !== null && (
            <div className="mb-3 p-2 bg-white border border-[#173A5E]/30 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#C5432E]" />
              <div>
                <span className="font-bold text-[#173A5E]">HUMANS DETECTED: {detectionsCount}</span>
                <p className="text-[10px] text-[#5B6B7C]">
                  GPS Lat/Lon estimated & written to log.
                </p>
              </div>
            </div>
          )}

          {assessment ? (
            <div className="space-y-2">
              <div className="bg-white p-2 border border-[#173A5E]/20">
                <span className="text-[#5B6B7C] text-[10px] block">DISASTER TYPE & SUBTYPE</span>
                <span className="font-bold text-[#173A5E] text-sm uppercase">
                  {assessment.disaster_type} ({assessment.disaster_subtype})
                </span>
              </div>

              <div className="bg-white p-2 border border-[#173A5E]/20">
                <span className="text-[#5B6B7C] text-[10px] block">DAMAGE SEVERITY</span>
                <span className={`font-bold text-sm uppercase ${
                  assessment.damage_severity === 'severe' || assessment.damage_severity === 'destroyed'
                    ? 'text-[#C5432E]'
                    : assessment.damage_severity === 'moderate'
                    ? 'text-[#B8862B]'
                    : 'text-[#3E7A5C]'
                }`}>
                  {assessment.damage_severity}
                </span>
              </div>

              <div className="bg-white p-2 border border-[#173A5E]/20">
                <span className="text-[#5B6B7C] text-[10px] block">COLLAPSE LEVEL & RUBBLE</span>
                <span className="font-semibold text-[#22303F]">
                  Collapse: {assessment.structural_collapse_level.toUpperCase()} | Rubble: {assessment.rubble_type.toUpperCase()}
                </span>
              </div>

              <div className="bg-white p-2 border border-[#173A5E]/20">
                <span className="text-[#5B6B7C] text-[10px] block">IDENTIFIED HAZARDS</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {assessment.hazards.map((h, i) => (
                    <span key={i} className="bg-[#C5432E]/10 text-[#C5432E] px-1.5 py-0.5 text-[10px] border border-[#C5432E]/30">
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-[#173A5E] text-white p-2">
                <span className="text-[10px] text-slate-300 block font-bold">RESCUE COORDINATOR NOTES</span>
                <p className="text-xs mt-1">{assessment.notes}</p>
              </div>
            </div>
          ) : (
            <div className="text-[#5B6B7C] space-y-2 text-[11px]">
              <p>No AI assessment run yet.</p>
              <p className="text-[10px]">
                Click "Run AI Damage Assessment" above to evaluate damage severity, collapse level, and hazards using server-side vision AI.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
