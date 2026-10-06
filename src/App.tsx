import React, { useState, useEffect } from 'react';
import { DetectionRecord, GeoState } from './types';
import { getStoredDetections, seedInitialDataIfEmpty } from './lib/storage';
import { Header } from './components/Header';
import { GeoRefPanel } from './components/GeoRefPanel';
import { InteractiveMap } from './components/InteractiveMap';
import { VideoFeed } from './components/VideoFeed';
import { UploadFeed } from './components/UploadFeed';
import { DroneFeed } from './components/DroneFeed';
import { DetectionLog } from './components/DetectionLog';
import { DamageCases } from './components/DamageCases';
import { ImpactStats } from './components/ImpactStats';
import { Camera, Upload, Radio } from 'lucide-react';

export default function App() {
  const [geoState, setGeoState] = useState<GeoState>({
    lat: 13.0827,
    lon: 80.2707,
    accuracy: 3.2,
    heading: 45,
    hFov: 60,
    personHeightM: 1.7,
  });

  const [activeTab, setActiveTab] = useState<'live' | 'upload' | 'drone'>('live');
  const [detections, setDetections] = useState<DetectionRecord[]>([]);
  const [selectedMapLatLon, setSelectedMapLatLon] = useState<{ lat: number; lon: number } | null>(null);

  const reloadDetections = () => {
    const list = getStoredDetections();
    setDetections(list);
  };

  useEffect(() => {
    // Seed initial demo data if empty so survivor coordinates are visible right away
    const initial = seedInitialDataIfEmpty();
    setDetections(initial);

    const handleStorageUpdate = () => {
      reloadDetections();
    };

    window.addEventListener('alpha6_detections_updated', handleStorageUpdate);
    return () => {
      window.removeEventListener('alpha6_detections_updated', handleStorageUpdate);
    };
  }, []);

  const handleFocusMapOnCurrentGeo = () => {
    if (geoState.lat !== null && geoState.lon !== null) {
      setSelectedMapLatLon({ lat: geoState.lat, lon: geoState.lon });
    }
  };

  const handleFocusMapOnDetection = (lat: number, lon: number) => {
    setSelectedMapLatLon({ lat, lon });
    // Scroll smoothly to map component
    document.getElementById('interactive-map-anchor')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2EC] text-[#22303F]">
      <Header
        storedCount={detections.length}
        hasGpsFix={geoState.lat !== null && geoState.lon !== null}
      />

      <main className="flex-1 max-w-[1140px] w-full mx-auto px-4 py-6">
        {/* Spatial Calibration & GPS Fix */}
        <GeoRefPanel
          geoState={geoState}
          setGeoState={setGeoState}
          onFocusMapOnCurrent={handleFocusMapOnCurrentGeo}
        />

        {/* Interactive Tactical Map Anchor */}
        <div id="interactive-map-anchor">
          <InteractiveMap
            geoState={geoState}
            detections={detections}
            selectedLatLon={selectedMapLatLon}
          />
        </div>

        {/* Feed Mode Tabs */}
        <section className="sheet mb-6 bg-white p-0 border border-[#173A5E]">
          <div className="flex flex-wrap border-b border-[#173A5E] bg-[#F4F2EC]">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex-1 min-w-[160px] py-3 px-4 font-mono text-xs uppercase tracking-wider font-semibold border-r border-[#173A5E] flex items-center justify-center gap-2 transition ${
                activeTab === 'live'
                  ? 'bg-[#173A5E] text-white'
                  : 'bg-[#F4F2EC] text-[#5B6B7C] hover:text-[#173A5E]'
              }`}
            >
              <Camera className="w-4 h-4 text-[#C5432E]" />
              01 — WEBCAM (LIVE)
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 min-w-[160px] py-3 px-4 font-mono text-xs uppercase tracking-wider font-semibold border-r border-[#173A5E] flex items-center justify-center gap-2 transition ${
                activeTab === 'upload'
                  ? 'bg-[#173A5E] text-white'
                  : 'bg-[#F4F2EC] text-[#5B6B7C] hover:text-[#173A5E]'
              }`}
            >
              <Upload className="w-4 h-4 text-[#C5432E]" />
              02 — UPLOAD IMAGE / VIDEO
            </button>

            <button
              onClick={() => setActiveTab('drone')}
              className={`flex-1 min-w-[160px] py-3 px-4 font-mono text-xs uppercase tracking-wider font-semibold flex items-center justify-center gap-2 transition ${
                activeTab === 'drone'
                  ? 'bg-[#173A5E] text-white'
                  : 'bg-[#F4F2EC] text-[#5B6B7C] hover:text-[#173A5E]'
              }`}
            >
              <Radio className="w-4 h-4 text-[#C5432E]" />
              03 — CONNECT TO DRONE
            </button>
          </div>

          <div>
            {activeTab === 'live' && (
              <VideoFeed
                geoState={geoState}
                onNewDetectionLogged={reloadDetections}
                onFocusMap={handleFocusMapOnDetection}
              />
            )}

            {activeTab === 'upload' && (
              <UploadFeed
                geoState={geoState}
                onNewDetectionLogged={reloadDetections}
                onFocusMap={handleFocusMapOnDetection}
              />
            )}

            {activeTab === 'drone' && (
              <DroneFeed
                geoState={geoState}
                onNewDetectionLogged={reloadDetections}
                onFocusMap={handleFocusMapOnDetection}
              />
            )}
          </div>
        </section>

        {/* Persistent SAR Human Survivor Log Table */}
        <DetectionLog
          detections={detections}
          onRefresh={reloadDetections}
          onFocusMap={handleFocusMapOnDetection}
        />

        {/* Test Scenarios & Impact Stats */}
        <DamageCases />
        <ImpactStats />
      </main>

      <footer className="border-t-2 border-[#173A5E] bg-white py-4 font-mono text-xs text-[#5B6B7C]">
        <div className="max-w-[1140px] mx-auto px-4 flex flex-wrap justify-between items-center gap-2">
          <span>ALPHA 6 — AI-POWERED AUTONOMOUS AERIAL DAMAGE ASSESSMENT & SURVIVOR LOCATION SYSTEM</span>
          <span>COMPETITION ENTRY — AI + HARDWARE</span>
        </div>
      </footer>
    </div>
  );
}
