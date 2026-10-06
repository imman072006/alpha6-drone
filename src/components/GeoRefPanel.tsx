import React, { useState } from 'react';
import { GeoState } from '../types';
import { Navigation, Compass, MapPin, Sliders, ChevronDown, ChevronUp, Zap } from 'lucide-react';

interface GeoRefPanelProps {
  geoState: GeoState;
  setGeoState: React.Dispatch<React.SetStateAction<GeoState>>;
  onFocusMapOnCurrent: () => void;
}

export const GeoRefPanel: React.FC<GeoRefPanelProps> = ({ geoState, setGeoState, onFocusMapOnCurrent }) => {
  const [statusMsg, setStatusMsg] = useState<string>(
    geoState.lat !== null && geoState.lon !== null
      ? 'GPS reference set. Per-person latitude and longitude estimates active for all detected humans (>50% confidence).'
      : 'No GPS fix yet — detected humans will be referenced by Search-Grid (A1–C3) until GPS + Heading are locked or entered manually.'
  );

  const [loadingGps, setLoadingGps] = useState(false);
  const [loadingCompass, setLoadingCompass] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleGetGpsFix = () => {
    if (!navigator.geolocation) {
      setStatusMsg('Geolocation not supported by browser — enter latitude and longitude manually below.');
      return;
    }
    setLoadingGps(true);
    setStatusMsg('Acquiring high-accuracy satellite GPS fix…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoState((prev) => ({
          ...prev,
          lat: parseFloat(pos.coords.latitude.toFixed(6)),
          lon: parseFloat(pos.coords.longitude.toFixed(6)),
          accuracy: pos.coords.accuracy,
          heading: prev.heading ?? 45, // default to NE heading if none set yet
        }));
        setLoadingGps(false);
        setStatusMsg(
          `GPS Fix Locked: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} (±${Math.round(
            pos.coords.accuracy
          )}m). Coordinates active.`
        );
      },
      (err) => {
        setLoadingGps(false);
        setStatusMsg(`GPS fix failed (${err.message}). Defaulting to search grid reference.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConnectCompass = async () => {
    setLoadingCompass(true);
    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm !== 'granted') {
          setStatusMsg('Compass access denied — enter heading manually (0° = North, 90° = East).');
          setLoadingCompass(false);
          return;
        }
      }

      const handler = (e: DeviceOrientationEvent) => {
        let heading: number | null = null;
        if (typeof (e as any).webkitCompassHeading === 'number') {
          heading = (e as any).webkitCompassHeading;
        } else if (typeof e.alpha === 'number') {
          heading = (360 - e.alpha) % 360;
        }

        if (heading !== null) {
          const clamped = Math.round(((heading % 360) + 360) % 360);
          setGeoState((prev) => ({ ...prev, heading: clamped }));
          setStatusMsg(`Compass locked: ${clamped}° True North.`);
        }
      };

      window.addEventListener('deviceorientationabsolute', handler, true);
      window.addEventListener('deviceorientation', handler, true);
      setStatusMsg('Listening to device compass… Turn to face camera direction.');
    } catch (e) {
      setStatusMsg('Device compass unavailable — enter heading manually.');
    } finally {
      setLoadingCompass(false);
    }
  };

  const setPresetLocation = (name: string, lat: number, lon: number, heading: number) => {
    setGeoState((prev) => ({
      ...prev,
      lat,
      lon,
      heading,
      accuracy: 2.5,
    }));
    setStatusMsg(`Locked Preset Location [${name}]: ${lat.toFixed(6)}, ${lon.toFixed(6)} (Heading ${heading}°).`);
  };

  return (
    <div className="sheet mb-6 bg-white p-4 border border-[#173A5E]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#173A5E]/20 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#C5432E]" />
          <h3 className="font-disp text-lg uppercase tracking-wide text-[#173A5E] font-semibold">
            00 — Location & Spatial Calibration
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#5B6B7C]">QUICK TEST LOCATIONS:</span>
          <button
            onClick={() => setPresetLocation('Chennai SAR Zone', 13.0827, 80.2707, 45)}
            className="text-xs font-mono bg-[#173A5E]/10 hover:bg-[#173A5E] text-[#173A5E] hover:text-white px-2 py-1 transition flex items-center gap-1 border border-[#173A5E]/30"
          >
            <Zap className="w-3 h-3 text-[#C5432E]" />
            Disaster Zone A
          </button>
          <button
            onClick={() => setPresetLocation('Quake Sector 4', 37.7749, -122.4194, 120)}
            className="text-xs font-mono bg-[#173A5E]/10 hover:bg-[#173A5E] text-[#173A5E] hover:text-white px-2 py-1 transition flex items-center gap-1 border border-[#173A5E]/30"
          >
            <Zap className="w-3 h-3 text-[#C5432E]" />
            Disaster Zone B
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          onClick={handleGetGpsFix}
          disabled={loadingGps}
          className="bg-[#173A5E] hover:bg-[#C5432E] text-white font-mono text-xs px-3 py-2 flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <Navigation className="w-3.5 h-3.5" />
          {loadingGps ? 'AQUIRING GPS…' : 'GET SATELLITE GPS FIX'}
        </button>

        <button
          onClick={handleConnectCompass}
          disabled={loadingCompass}
          className="border border-[#173A5E] hover:bg-[#173A5E] text-[#173A5E] hover:text-white font-mono text-xs px-3 py-2 flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <Compass className="w-3.5 h-3.5" />
          {loadingCompass ? 'CONNECTING…' : 'USE COMPASS'}
        </button>

        <div className="flex items-center gap-2 text-xs font-mono">
          <label className="text-[#5B6B7C] flex items-center gap-1">
            LAT:
            <input
              type="number"
              step="0.000001"
              placeholder="e.g. 13.082700"
              value={geoState.lat ?? ''}
              onChange={(e) =>
                setGeoState((prev) => ({
                  ...prev,
                  lat: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              className="w-28 px-2 py-1 border border-[#173A5E] bg-[#F4F2EC] text-[#22303F] text-xs font-mono"
            />
          </label>

          <label className="text-[#5B6B7C] flex items-center gap-1">
            LON:
            <input
              type="number"
              step="0.000001"
              placeholder="e.g. 80.270700"
              value={geoState.lon ?? ''}
              onChange={(e) =>
                setGeoState((prev) => ({
                  ...prev,
                  lon: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              className="w-28 px-2 py-1 border border-[#173A5E] bg-[#F4F2EC] text-[#22303F] text-xs font-mono"
            />
          </label>

          <label className="text-[#5B6B7C] flex items-center gap-1">
            HEADING°:
            <input
              type="number"
              min="0"
              max="359"
              placeholder="0=N"
              value={geoState.heading ?? ''}
              onChange={(e) =>
                setGeoState((prev) => ({
                  ...prev,
                  heading: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              className="w-16 px-2 py-1 border border-[#173A5E] bg-[#F4F2EC] text-[#22303F] text-xs font-mono"
            />
          </label>
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="ml-auto text-xs font-mono text-[#5B6B7C] hover:text-[#173A5E] flex items-center gap-1"
        >
          <Sliders className="w-3.5 h-3.5" />
          CALIBRATION
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {showAdvanced && (
        <div className="bg-[#F4F2EC] p-3 border border-[#173A5E]/20 text-xs font-mono mb-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[#173A5E] font-semibold mb-1">
              Horizontal Field of View (FOV°):
            </label>
            <input
              type="number"
              min="20"
              max="120"
              value={geoState.hFov}
              onChange={(e) =>
                setGeoState((prev) => ({ ...prev, hFov: parseFloat(e.target.value) || 60 }))
              }
              className="w-24 px-2 py-1 border border-[#173A5E] bg-white text-xs"
            />
            <p className="text-[11px] text-[#5B6B7C] mt-1">
              Standard webcam/drone FOV is 60°. Adjusts bearing projection spread.
            </p>
          </div>

          <div>
            <label className="block text-[#173A5E] font-semibold mb-1">
              Assumed Person Height (m):
            </label>
            <input
              type="number"
              min="1.0"
              max="2.2"
              step="0.05"
              value={geoState.personHeightM}
              onChange={(e) =>
                setGeoState((prev) => ({
                  ...prev,
                  personHeightM: parseFloat(e.target.value) || 1.7,
                }))
              }
              className="w-24 px-2 py-1 border border-[#173A5E] bg-white text-xs"
            />
            <p className="text-[11px] text-[#5B6B7C] mt-1">
              Pinhole estimation uses adult height (default 1.7m) to derive distance from bounding box height.
            </p>
          </div>
        </div>
      )}

      <div className="bg-[#173A5E]/5 p-2.5 border-l-2 border-[#173A5E] font-mono text-xs flex items-center justify-between">
        <span className="text-[#22303F]">{statusMsg}</span>
        {geoState.lat !== null && geoState.lon !== null && (
          <button
            onClick={onFocusMapOnCurrent}
            className="text-[11px] underline text-[#173A5E] hover:text-[#C5432E] font-bold whitespace-nowrap ml-2"
          >
            VIEW ON MAP ↓
          </button>
        )}
      </div>
    </div>
  );
};
