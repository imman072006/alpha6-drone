import React, { useRef, useState, useEffect } from 'react';
import { DetectionRecord, GeoState, ThermalPaletteMode } from '../types';
import { getCocoModel, drawDetectionBoxes } from '../lib/detector';
import { drawSearchGrid, positionInfo } from '../lib/geo';
import { applyThermalEffect } from '../lib/thermal';
import { makeTracker, updateTracker, CONFIRM_FRAMES, SAVE_MIN_SCORE, RESAVE_INTERVAL_MS } from '../lib/tracker';
import { saveDetectionRecord } from '../lib/storage';
import { Radio, Flame, EyeOff, HelpCircle, CheckCircle, Wifi, Sliders } from 'lucide-react';

interface DroneFeedProps {
  geoState: GeoState;
  onNewDetectionLogged: () => void;
  onFocusMap: (lat: number, lon: number) => void;
}

export const DroneFeed: React.FC<DroneFeedProps> = ({
  geoState,
  onNewDetectionLogged,
  onFocusMap,
}) => {
  const [streamUrl, setStreamUrl] = useState('');
  const [active, setActive] = useState(false);
  const [thermal, setThermal] = useState(false);
  const [thermalPalette, setThermalPalette] = useState<ThermalPaletteMode>('ironbow');
  const [heatSensitivity, setHeatSensitivity] = useState<number>(1.0);
  const [showHUD, setShowHUD] = useState<boolean>(true);
  const [status, setStatus] = useState('Standby');
  const [showInstructions, setShowInstructions] = useState(false);
  const [liveDetections, setLiveDetections] = useState<any[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thermalCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const handleConnect = async () => {
    if (!streamUrl.trim()) {
      setStatus('Please enter a valid network video stream URL.');
      return;
    }

    try {
      setStatus('Loading TensorFlow.js COCO-SSD model…');
      await getCocoModel((msg) => setStatus(msg));

      setStatus('Connecting to network stream…');
      const videoEl = videoRef.current;
      if (!videoEl) return;

      videoEl.crossOrigin = 'anonymous';
      videoEl.src = streamUrl.trim();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Stream connection timed out')), 9000);
        videoEl.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        videoEl.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Unable to open video stream'));
        };
      });

      try {
        await videoEl.play();
      } catch (playErr: any) {
        if (playErr.name === 'AbortError' || playErr.message?.includes('interrupted')) {
          console.warn('Drone stream play request interrupted:', playErr.message);
        } else {
          throw playErr;
        }
      }

      setActive(true);
      setStatus('Live — Drone Video Stream Active');
      trackerRef.current = makeTracker();
      runLoop();
    } catch (e: any) {
      console.error('Drone feed connection error:', e);
      setStatus(`Drone stream error: ${e.message || 'Stream unreachable'}. Verify local IP/URL.`);
      stopStream();
    }
  };

  const stopStream = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setActive(false);
    setStatus('Standby');
    setLiveDetections([]);
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
        const rawPreds = await model.detect(videoEl, 30, 0.50);
        const preds = rawPreds.map((d) => ({
          bbox: d.bbox as [number, number, number, number],
          class: d.class,
          score: d.score,
        }));

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

        const humanPreds = preds.filter((p) => p.class === 'person');
        const matches = updateTracker(trackerRef.current, humanPreds, w, h);

        const now = performance.now();
        const detectedItemsList: any[] = [];

        matches.forEach((m) => {
          const pos = positionInfo(m.pred.bbox, w, h, geoState);
          const score = m.pred.score;
          const scorePct = Math.round(score * 100);
          const clearsSave = score >= SAVE_MIN_SCORE;

          if (!m.track.confirmed && m.track.framesSeen >= CONFIRM_FRAMES) {
            m.track.confirmed = true;
            if (clearsSave) {
              m.track.lastSaveTime = now;
              logPersonToStore(m.track.id, pos, scorePct);
            }
          } else if (
            m.track.confirmed &&
            clearsSave &&
            now - m.track.lastSaveTime > RESAVE_INTERVAL_MS
          ) {
            m.track.lastSaveTime = now;
            logPersonToStore(m.track.id, pos, scorePct);
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
        // Frame processing skip
      }

      animFrameIdRef.current = requestAnimationFrame(step);
    };

    step();
  };

  const logPersonToStore = (trackId: string, pos: any, confidencePct: number) => {
    const record: DetectionRecord = {
      id: trackId,
      savedAt: new Date().toISOString(),
      source: 'DRONE STREAM',
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
      <div className="p-3 bg-white border-b border-[#173A5E] font-mono text-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Drone / IP Camera Stream URL (e.g. http://192.168.1.42:8080/video)"
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
            disabled={active}
            className="flex-1 min-w-[260px] px-3 py-2 border border-[#173A5E] bg-[#F4F2EC] text-[#22303F] text-xs font-mono"
          />

          {!active ? (
            <button
              onClick={handleConnect}
              className="bg-[#173A5E] hover:bg-[#C5432E] text-white px-3 py-2 flex items-center gap-1.5 transition font-semibold"
            >
              <Wifi className="w-4 h-4" />
              CONNECT TO DRONE
            </button>
          ) : (
            <button
              onClick={stopStream}
              className="bg-[#C5432E] hover:bg-[#173A5E] text-white px-3 py-2 flex items-center gap-1.5 transition font-semibold"
            >
              <EyeOff className="w-4 h-4" />
              DISCONNECT
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
            THERMAL: {thermal ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-[#5B6B7C] hover:text-[#173A5E] flex items-center gap-1 underline text-[11px]"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            PHONE AS DRONE STREAM
          </button>
        </div>

        {thermal && (
          <div className="bg-[#0E1A26] text-white p-2.5 border border-[#173A5E] flex flex-wrap items-center justify-between gap-3 text-xs font-mono mt-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[#49D3E0] font-bold flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5" />
                DRONE IR PALETTE:
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

        {showInstructions && (
          <div className="bg-[#F4F2EC] p-3 border border-[#173A5E]/30 text-xs text-[#22303F] space-y-1">
            <p className="font-bold text-[#173A5E]">USING PHONE AS A DRONE CAMERA STREAM:</p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#5B6B7C]">
              <li>Install a free IP camera app on Android (IP Webcam) or iOS (IP Camera Lite).</li>
              <li>Connect phone and computer to the same Wi-Fi network.</li>
              <li>Start server in phone app, then copy the URL (e.g. <code>http://192.168.1.42:8080/video</code>).</li>
              <li>Paste above & click "Connect To Drone".</li>
            </ol>
          </div>
        )}

        <div className="text-[#5B6B7C] font-semibold">STATUS: {status}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3">
        <div className="md:col-span-2 relative aspect-[4/3] bg-[#0E1A26] overflow-hidden border-r border-[#173A5E]">
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#5B6B7C] p-6 text-center font-mono">
              <Radio className="w-12 h-12 text-[#173A5E] mb-3 opacity-60" />
              <p className="text-sm text-[#3E6690] font-semibold">DRONE STREAM DISCONNECTED</p>
              <p className="text-xs text-[#5B6B7C] mt-2 max-w-sm">
                Enter an HTTP/MJPEG/RTSP network video stream URL from your drone hardware or IP camera app to analyze live aerial video.
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
            <span>DRONE FEED DETECTIONS</span>
            <span className="font-mono text-xs bg-[#173A5E] text-white px-1.5 py-0.5">
              {liveDetections.length}
            </span>
          </h4>

          {liveDetections.length === 0 ? (
            <p className="text-xs font-mono text-[#5B6B7C]">
              No active human detections in drone stream.
            </p>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {liveDetections.map((item, idx) => (
                <div key={item.id || idx} className="p-2.5 bg-[#F4F2EC] border border-[#173A5E]/30">
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
                    <div>POSITION: {item.quadrant}</div>
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
                        Set GPS in calibration panel above for lat/lon.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
