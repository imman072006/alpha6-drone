import React, { useEffect, useRef, useState } from 'react';
import { CameraDevice, DetectionRecord, GeoState, ThermalPaletteMode } from '../types';
import { getCocoModel, drawDetectionBoxes } from '../lib/detector';
import { drawSearchGrid, positionInfo } from '../lib/geo';
import { applyThermalEffect } from '../lib/thermal';
import { makeTracker, updateTracker, CONFIRM_FRAMES, SAVE_MIN_SCORE, RESAVE_INTERVAL_MS } from '../lib/tracker';
import { saveDetectionRecord } from '../lib/storage';
import { Camera, Flame, EyeOff, MapPin, CheckCircle, Video, Sliders, Eye } from 'lucide-react';

interface VideoFeedProps {
  geoState: GeoState;
  onNewDetectionLogged: () => void;
  onFocusMap: (lat: number, lon: number) => void;
}

export const VideoFeed: React.FC<VideoFeedProps> = ({
  geoState,
  onNewDetectionLogged,
  onFocusMap,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thermalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [active, setActive] = useState(false);
  const [thermal, setThermal] = useState(false);
  const [thermalPalette, setThermalPalette] = useState<ThermalPaletteMode>('ironbow');
  const [heatSensitivity, setHeatSensitivity] = useState<number>(1.0);
  const [showHUD, setShowHUD] = useState<boolean>(true);
  const [status, setStatus] = useState('Standby');
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [liveDetections, setLiveDetections] = useState<any[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const trackerRef = useRef(makeTracker());

  const thermalRef = useRef(thermal);
  const thermalPaletteRef = useRef(thermalPalette);
  const heatSensRef = useRef(heatSensitivity);
  const showHUDRef = useRef(showHUD);

  useEffect(() => { thermalRef.current = thermal; }, [thermal]);
  useEffect(() => { thermalPaletteRef.current = thermalPalette; }, [thermalPalette]);
  useEffect(() => { heatSensRef.current = heatSensitivity; }, [heatSensitivity]);
  useEffect(() => { showHUDRef.current = showHUD; }, [showHUD]);


  // Enumerate cameras
  const refreshDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));
      setDevices(cams);
    } catch (e) {
      console.warn('Unable to enumerate cameras:', e);
    }
  };

  useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    }
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch (e) {
        // ignore pause errors on uninitialized video
      }
      videoRef.current.srcObject = null;
    }
    setActive(false);
    setStatus('Standby');
    setLiveDetections([]);
  };

  const startCamera = async () => {
    stopCamera();

    try {
      setStatus('Loading TensorFlow.js COCO-SSD model…');
      await getCocoModel((msg) => setStatus(msg));

      setStatus('Requesting camera stream access…');
      const constraint = selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId } }
        : true;

      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: constraint });
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch (playErr: any) {
          if (playErr.name === 'AbortError' || playErr.message?.includes('interrupted')) {
            console.warn('Webcam play request interrupted:', playErr.message);
          } else {
            throw playErr;
          }
        }
      }

      refreshDevices(); // Refresh camera labels after permission grant
      setActive(true);
      setStatus('Live — Real-Time Detection Scanning Active');

      // Start detection loop
      trackerRef.current = makeTracker();
      runLoop();
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('interrupted')) {
        console.warn('Webcam startup interrupted by new stream or pause state.');
        return;
      }
      console.error('Failed to start webcam:', err);
      setStatus(`Camera error: ${err.message || 'Permission denied or camera unavailable'}`);
      stopCamera();
    }
  };

  const runLoop = () => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const step = async () => {
      if (!videoEl || videoEl.paused || videoEl.ended) return;

      const w = videoEl.videoWidth || 640;
      const h = videoEl.videoHeight || 480;

      if (canvasEl.width !== w || canvasEl.height !== h) {
        canvasEl.width = w;
        canvasEl.height = h;
      }

      try {
        const model = await getCocoModel();
        // Run object detection
        const rawPreds = await model.detect(videoEl, 30, 0.50); // >50% threshold
        const preds = rawPreds.map((d) => ({
          bbox: d.bbox as [number, number, number, number],
          class: d.class,
          score: d.score,
        }));

        // Render video frame or thermal simulation
        const isThermal = thermalRef.current;
        if (isThermal) {
          applyThermalEffect(ctx, videoEl, w, h, preds, thermalCanvasRef, {
            palette: thermalPaletteRef.current,
            heatSensitivity: heatSensRef.current,
            showHUD: showHUDRef.current,
          });
        } else {
          ctx.clearRect(0, 0, w, h);
        }

        drawSearchGrid(ctx, w, h);
        drawDetectionBoxes(ctx, w, h, preds, isThermal);

        // Process humans
        const humanPreds = preds.filter((p) => p.class === 'person');
        const matches = updateTracker(trackerRef.current, humanPreds, w, h);

        const now = performance.now();
        const detectedItemsList: any[] = [];

        matches.forEach((m) => {
          const pos = positionInfo(m.pred.bbox, w, h, geoState);
          const score = m.pred.score;
          const scorePct = Math.round(score * 100);

          // Store detection if confidence > 50%
          const clearsSave = score >= SAVE_MIN_SCORE;

          if (!m.track.confirmed && m.track.framesSeen >= CONFIRM_FRAMES) {
            m.track.confirmed = true;
            if (clearsSave) {
              m.track.lastSaveTime = now;
              m.track.frozenPos = pos;
              logPersonToStore(m.track.id, pos, scorePct, 'LIVE WEBCAM');
            }
          } else if (
            m.track.confirmed &&
            clearsSave &&
            now - m.track.lastSaveTime > RESAVE_INTERVAL_MS
          ) {
            m.track.lastSaveTime = now;
            m.track.frozenPos = pos;
            logPersonToStore(m.track.id, pos, scorePct, 'LIVE WEBCAM');
          }

          detectedItemsList.push({
            id: m.track.id,
            scorePct,
            grid: pos.grid,
            quadrant: pos.quadrant,
            xPct: pos.xPct,
            yPct: pos.yPct,
            lat: pos.latLon?.lat ?? null,
            lon: pos.latLon?.lon ?? null,
            distanceM: pos.latLon?.distanceM ?? null,
            confirmed: m.track.confirmed && clearsSave,
          });
        });

        setLiveDetections(detectedItemsList);
      } catch (e) {
        // Frame drop fallback
      }

      animFrameIdRef.current = requestAnimationFrame(step);
    };

    step();
  };

  const logPersonToStore = (
    trackId: string,
    pos: any,
    confidencePct: number,
    source: DetectionRecord['source']
  ) => {
    const record: DetectionRecord = {
      id: trackId,
      savedAt: new Date().toISOString(),
      source,
      grid: pos.grid,
      quadrant: pos.quadrant,
      xPct: pos.xPct,
      yPct: pos.yPct,
      lat: pos.latLon?.lat ?? null,
      lon: pos.latLon?.lon ?? null,
      distanceM: pos.latLon?.distanceM ?? null,
      confidence: confidencePct,
      status: 'Unverified',
    };

    saveDetectionRecord(record);
    onNewDetectionLogged();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border-b border-[#173A5E] font-mono text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {!active ? (
            <button
              onClick={startCamera}
              className="bg-[#173A5E] hover:bg-[#C5432E] text-white px-3 py-2 flex items-center gap-1.5 transition font-semibold"
            >
              <Video className="w-4 h-4" />
              CONNECT TO CAMERA
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="bg-[#C5432E] hover:bg-[#173A5E] text-white px-3 py-2 flex items-center gap-1.5 transition font-semibold"
            >
              <EyeOff className="w-4 h-4" />
              STOP CAMERA
            </button>
          )}

          <button
            onClick={() => setThermal(!thermal)}
            disabled={!active}
            className={`border px-3 py-2 flex items-center gap-1.5 transition disabled:opacity-40 ${
              thermal
                ? 'bg-[#C5432E] text-white border-[#C5432E]'
                : 'border-[#173A5E] text-[#173A5E] hover:bg-[#173A5E] hover:text-white'
            }`}
          >
            <Flame className="w-4 h-4" />
            THERMAL VIEW: {thermal ? 'ON' : 'OFF'}
          </button>

          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={active}
            className="border border-[#173A5E] bg-[#F4F2EC] px-2 py-2 text-xs font-mono text-[#22303F] max-w-xs"
          >
            <option value="">Camera: System Default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-[#5B6B7C] font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#3E7A5C] inline-block animate-ping" />
          STATUS: {status}
        </div>
      </div>

      {thermal && (
        <div className="bg-[#0E1A26] text-white p-2.5 border-b border-[#173A5E] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[#49D3E0] font-bold flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" />
              FLIR PALETTE:
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

      <div className="grid grid-cols-1 md:grid-cols-3">
        <div className="md:col-span-2 relative aspect-[4/3] bg-[#0E1A26] overflow-hidden border-r border-[#173A5E]">
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#5B6B7C] p-6 text-center font-mono">
              <Camera className="w-12 h-12 text-[#173A5E] mb-3 opacity-60" />
              <p className="text-sm text-[#3E6690] font-semibold">CAMERA FEED STANDBY</p>
              <p className="text-xs text-[#5B6B7C] mt-2 max-w-sm">
                Connect your laptop camera, external USB camera, or mobile device (via DroidCam / EpocCam / Continuity Camera). Detection algorithm identifies human survivors in real-time.
              </p>
            </div>
          )}

          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${active ? 'block' : 'hidden'}`}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        </div>

        <div className="p-4 bg-white border-t md:border-t-0 md:border-l border-[#173A5E] max-h-[420px] overflow-y-auto">
          <h4 className="font-disp text-sm uppercase tracking-wider text-[#173A5E] font-bold border-b border-[#173A5E]/20 pb-2 mb-3 flex items-center justify-between">
            <span>LIVE IN-FRAME DETECTIONS</span>
            <span className="font-mono text-xs bg-[#173A5E] text-white px-1.5 py-0.5">
              {liveDetections.length}
            </span>
          </h4>

          {liveDetections.length === 0 ? (
            <p className="text-xs font-mono text-[#5B6B7C]">
              No active human detections in camera view. Ensure subject is visible.
            </p>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {liveDetections.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-2.5 bg-[#F4F2EC] border border-[#173A5E]/30 relative"
                >
                  <div className="flex items-center justify-between font-bold text-[#173A5E] mb-1">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-[#C5432E]" />
                      PERSON #{idx + 1} — {item.scorePct}%
                    </span>
                    <span className="bg-[#173A5E]/10 px-1.5 py-0.5 text-[10px]">
                      GRID {item.grid}
                    </span>
                  </div>

                  <div className="text-[11px] text-[#5B6B7C] space-y-0.5">
                    <div>
                      POSITION: {item.quadrant} (X: {item.xPct}%, Y: {item.yPct}%)
                    </div>
                    {item.lat !== null && item.lon !== null ? (
                      <div className="text-[#C5432E] font-semibold mt-1 flex items-center justify-between">
                        <span>
                          LAT/LON: {item.lat.toFixed(6)}, {item.lon.toFixed(6)} (~{item.distanceM}m)
                        </span>
                        <button
                          onClick={() => onFocusMap(item.lat, item.lon)}
                          className="underline hover:text-[#173A5E] text-[10px]"
                        >
                          MAP
                        </button>
                      </div>
                    ) : (
                      <div className="text-[#B8862B] text-[10px] italic">
                        GPS reference pending — lock GPS in panel above for Lat/Lon calculation.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-[#173A5E]/20 text-[11px] font-mono text-[#5B6B7C]">
            <p className="font-semibold text-[#173A5E] mb-1">DETECTION CRITERIA:</p>
            <ul className="list-disc list-inside space-y-1 text-[10px]">
              <li>Confidence Threshold: &gt;50% (0.50 score)</li>
              <li>Multi-frame Tracker: 3 consecutive frames</li>
              <li>Auto-stored to persistent SAR log</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
