import React, { useEffect, useRef, useState } from 'react';
import { DetectionRecord, GeoState } from '../types';
import L from 'leaflet';
import { updateDetectionStatus } from '../lib/storage';
import {
  Map as MapIcon,
  Layers,
  UserCheck,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Tag,
  Compass,
  CheckCircle,
  Truck,
  AlertTriangle,
  Copy,
  ExternalLink,
} from 'lucide-react';

interface InteractiveMapProps {
  geoState: GeoState;
  detections: DetectionRecord[];
  selectedLatLon: { lat: number; lon: number } | null;
}

type MapStyle = 'osm' | 'satellite' | 'dark';
type LabelMode = 'detailed' | 'compact' | 'hover';

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  geoState,
  detections,
  selectedLatLon,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');
  const [labelMode, setLabelMode] = useState<LabelMode>('detailed');
  const [currentZoom, setCurrentZoom] = useState<number>(18);

  // Initialize Leaflet Map with ultra-high zoom capability (up to Zoom 22)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultLat = geoState.lat ?? 13.0827;
      const defaultLon = geoState.lon ?? 80.2707;

      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLon],
        zoom: 18,
        minZoom: 3,
        maxZoom: 22,
        zoomControl: false, // We render tactical custom zoom buttons
      });

      // Register zoom listener
      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      markersGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle Tile Layer style & high-resolution upscaling (maxZoom: 22)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    let attribution = '&copy; Esri World Imagery, DigitalGlobe, GeoEye';
    let maxNative = 19;

    if (mapStyle === 'osm') {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
      maxNative = 19;
    } else if (mapStyle === 'dark') {
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; CARTO Dark Matter Tactical';
      maxNative = 20;
    }

    const newTile = L.tileLayer(url, {
      attribution,
      maxZoom: 22,       // Allows extreme zoom in for pinpointing survivors
      maxNativeZoom: maxNative, // Auto-scales tiles smoothly above native limits
    }).addTo(map);

    tileLayerRef.current = newTile;
  }, [mapStyle]);

  // Update map markers when detections, labelMode, or geoState change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // 1. Plot Operator / Drone camera position
    if (geoState.lat !== null && geoState.lon !== null) {
      const droneIcon = L.divIcon({
        className: 'custom-drone-icon',
        html: `
          <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: -4px; border-radius: 50%; border: 2px dashed #49D3E0; animation: spin 10s linear infinite;"></div>
            <div style="background-color: #173A5E; color: white; width: 28px; height: 28px; border-radius: 50%; border: 2px solid #49D3E0; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(73, 211, 224, 0.6);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#49D3E0" stroke-width="2.5"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const droneMarker = L.marker([geoState.lat, geoState.lon], { icon: droneIcon });
      droneMarker.bindPopup(`
        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 4px; color: #173A5E;">
          <b style="color: #173A5E; font-size: 12px;">DRONE / CAMERA BASE POSITION</b><br/>
          Latitude: ${geoState.lat.toFixed(6)}<br/>
          Longitude: ${geoState.lon.toFixed(6)}<br/>
          Heading: ${geoState.heading ?? 0}° | Alt: ${geoState.personHeightM ?? 1.7}m
        </div>
      `);
      markersGroup.addLayer(droneMarker);

      // Draw FOV direction fan
      if (geoState.heading !== null) {
        const headingRad = (geoState.heading * Math.PI) / 180;
        const fovRad = (geoState.hFov * Math.PI) / 180;
        const radiusM = 120; // 120m fan radius

        const leftRad = headingRad - fovRad / 2;
        const rightRad = headingRad + fovRad / 2;

        const R = 6371000;
        const latRad = (geoState.lat * Math.PI) / 180;
        const lonRad = (geoState.lon * Math.PI) / 180;

        const getPoint = (bearing: number) => {
          const lat2 = Math.asin(
            Math.sin(latRad) * Math.cos(radiusM / R) +
              Math.cos(latRad) * Math.sin(radiusM / R) * Math.cos(bearing)
          );
          const lon2 =
            lonRad +
            Math.atan2(
              Math.sin(bearing) * Math.sin(radiusM / R) * Math.cos(latRad),
              Math.cos(radiusM / R) - Math.sin(latRad) * Math.sin(lat2)
            );
          return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI] as [number, number];
        };

        const polygonPoints = [
          [geoState.lat, geoState.lon] as [number, number],
          getPoint(leftRad),
          getPoint(headingRad),
          getPoint(rightRad),
        ];

        const fovPolygon = L.polygon(polygonPoints, {
          color: '#C5432E',
          fillColor: '#C5432E',
          fillOpacity: 0.18,
          weight: 1.5,
          dashArray: '4,4',
        });
        markersGroup.addLayer(fovPolygon);
      }
    }

    // Map detection ID to survivor index
    const survivorNumberMap = new Map<string, number>();
    detections.forEach((d, i) => {
      survivorNumberMap.set(d.id, i + 1);
    });

    // 2. Plot all detected humans with valid Lat/Lon
    const validDetections = detections.filter((d) => d.lat !== null && d.lon !== null);

    validDetections.forEach((d, idx) => {
      const survNum = survivorNumberMap.get(d.id) ?? idx + 1;
      const isRescued = d.status === 'Rescued';
      const isDispatched = d.status === 'Dispatched';
      const bgColor = isRescued ? '#3E7A5C' : isDispatched ? '#B8862B' : '#C5432E';
      const statusLabel = isRescued ? 'RESCUED' : isDispatched ? 'DISPATCHED' : 'UNVERIFIED';

      // Enhanced Icon with status badge and pulsing radar ring for active alerts
      const humanIcon = L.divIcon({
        className: 'custom-human-icon',
        html: `
          <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
            ${!isRescued && !isDispatched ? '<div class="radar-ring"></div>' : ''}
            <div style="background-color: ${bgColor}; color: white; border: 2px solid #FFFFFF; border-radius: 6px; padding: 2px 6px; display: flex; align-items: center; gap: 4px; box-shadow: 0 3px 10px rgba(0,0,0,0.5); font-family: 'Oswald', sans-serif; font-size: 11px; font-weight: bold; white-space: nowrap;">
              <span>#${survNum}</span>
              <span style="font-size: 9px; opacity: 0.9; background: rgba(0,0,0,0.25); padding: 0px 3px; border-radius: 2px; font-family: 'IBM Plex Mono', monospace;">${d.confidence}%</span>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([d.lat!, d.lon!], { icon: humanIcon });

      // Add permanent floating tactical label or tooltip according to labelMode
      if (labelMode === 'detailed' || labelMode === 'compact') {
        const tooltipContent =
          labelMode === 'detailed'
            ? `
              <div style="font-family: 'IBM Plex Mono', monospace; font-size: 10px; line-height: 1.3;">
                <div style="color: ${bgColor}; font-weight: bold; font-size: 11px; border-b: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; margin-bottom: 2px;">
                  SURVIVOR #${survNum} • ${statusLabel} (${d.confidence}%)
                </div>
                <div>GPS: ${d.lat!.toFixed(6)}, ${d.lon!.toFixed(6)}</div>
                <div>GRID: ${d.grid} (${d.quadrant}) • ${d.distanceM ?? 'N/A'}m</div>
              </div>
            `
            : `SURVIVOR #${survNum} [${statusLabel}] • ${d.grid}`;

        marker.bindTooltip(tooltipContent, {
          permanent: labelMode === 'detailed',
          direction: 'top',
          offset: [0, -18],
          className: 'survivor-map-tooltip',
        });
      } else {
        // Hover mode
        marker.bindTooltip(`SURVIVOR #${survNum} • ${statusLabel} (${d.confidence}%)`, {
          direction: 'top',
          offset: [0, -18],
          className: 'survivor-map-tooltip',
        });
      }

      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`;

      // Rich interactive click popup with action buttons
      marker.bindPopup(`
        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #22303F; padding: 4px; min-width: 220px;">
          <div style="background-color: ${bgColor}; color: white; padding: 4px 8px; font-weight: bold; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px;">
            <span>SURVIVOR #${survNum}</span>
            <span style="font-size: 10px; opacity: 0.9;">${d.confidence}% CONF</span>
          </div>
          
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 11px; margin-bottom: 8px;">
            <b>STATUS:</b> <span style="font-weight: bold; color: ${bgColor};">${statusLabel}</span>
            <b>GPS LAT:</b> <span>${d.lat!.toFixed(6)}</span>
            <b>GPS LON:</b> <span>${d.lon!.toFixed(6)}</span>
            <b>DISTANCE:</b> <span>~${d.distanceM ?? 'N/A'} meters</span>
            <b>GRID:</b> <span>${d.grid} (${d.quadrant})</span>
            <b>SOURCE:</b> <span>${d.source}</span>
            <b>TIME:</b> <span>${new Date(d.savedAt).toLocaleTimeString()}</span>
          </div>

          ${d.notes ? `<div style="background: #F4F2EC; p: 4px; border-left: 2px solid ${bgColor}; font-style: italic; margin-bottom: 8px; font-size: 10px; color: #5B6B7C;">"${d.notes}"</div>` : ''}

          <div style="border-top: 1px dashed #CCC; padding-top: 8px; margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; gap: 4px;">
              <button class="btn-dispatch-sar" style="flex: 1; background: #B8862B; color: white; border: none; padding: 4px; font-size: 10px; font-weight: bold; cursor: pointer; font-family: monospace;">
                + DISPATCH SAR
              </button>
              <button class="btn-rescue-sar" style="flex: 1; background: #3E7A5C; color: white; border: none; padding: 4px; font-size: 10px; font-weight: bold; cursor: pointer; font-family: monospace;">
                ✓ MARK RESCUED
              </button>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px;">
              <a href="#" class="btn-copy-coords" style="color: #173A5E; font-weight: bold; text-decoration: underline;">
                📋 Copy Coords
              </a>
              <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="color: #C5432E; font-weight: bold; text-decoration: underline;">
                🗺 Open Google Maps &rarr;
              </a>
            </div>
          </div>
        </div>
      `);

      // Bind dynamic event listeners inside popup when opened
      marker.on('popupopen', () => {
        const container = marker.getPopup()?.getElement();
        if (!container) return;

        const dispatchBtn = container.querySelector('.btn-dispatch-sar');
        const rescueBtn = container.querySelector('.btn-rescue-sar');
        const copyBtn = container.querySelector('.btn-copy-coords');

        if (dispatchBtn) {
          dispatchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            updateDetectionStatus(d.id, 'Dispatched');
            marker.closePopup();
          });
        }

        if (rescueBtn) {
          rescueBtn.addEventListener('click', (e) => {
            e.preventDefault();
            updateDetectionStatus(d.id, 'Rescued');
            marker.closePopup();
          });
        }

        if (copyBtn) {
          copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(`${d.lat?.toFixed(6)}, ${d.lon?.toFixed(6)}`);
            alert(`Copied coordinates: ${d.lat?.toFixed(6)}, ${d.lon?.toFixed(6)}`);
          });
        }
      });

      markersGroup.addLayer(marker);
    });

    // Auto-fit bounds if we have selected point or initial load
    if (selectedLatLon) {
      map.setView([selectedLatLon.lat, selectedLatLon.lon], 19);
    } else if (validDetections.length > 0 && geoState.lat !== null && geoState.lon !== null) {
      const bounds = L.latLngBounds([
        [geoState.lat, geoState.lon],
        ...validDetections.map((d) => [d.lat!, d.lon!] as [number, number]),
      ]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    } else if (geoState.lat !== null && geoState.lon !== null) {
      map.setView([geoState.lat, geoState.lon], 18);
    }
  }, [geoState, detections, selectedLatLon, labelMode]);

  // Map Navigation & Zoom Handlers
  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const handleResetView = () => {
    if (mapInstanceRef.current && geoState.lat !== null && geoState.lon !== null) {
      mapInstanceRef.current.setView([geoState.lat, geoState.lon], 18);
    }
  };

  const getZoomResolutionText = (z: number) => {
    if (z >= 21) return 'SUB-CENTIMETER Precision (~0.05m/px)';
    if (z >= 19) return 'SUB-METER Precision (~0.2m/px)';
    if (z >= 17) return 'TACTICAL BUILDING Level (~0.8m/px)';
    if (z >= 15) return 'NEIGHBORHOOD Grid (~3m/px)';
    return 'REGIONAL Overview';
  };

  return (
    <div className="sheet mb-6 bg-white p-4 border border-[#173A5E]">
      {/* Tactical Map Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#173A5E]/20 pb-3 mb-3 gap-3">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-[#173A5E]" />
          <div>
            <h3 className="font-disp text-lg uppercase tracking-wide text-[#173A5E] font-semibold leading-none">
              01 — Geospatial Tactical Map & Survivor GPS Coordinates
            </h3>
            <span className="font-mono text-[11px] text-[#49D3E0] bg-[#0E1A26] px-1.5 py-0.5 rounded inline-block mt-1">
              ZOOM LEVEL: {currentZoom}x • {getZoomResolutionText(currentZoom)}
            </span>
          </div>
        </div>

        {/* Map Style & Label Controls */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Map Layer Switcher */}
          <div className="flex items-center border border-[#173A5E] bg-[#F4F2EC] overflow-hidden">
            <span className="px-2 py-1 bg-[#173A5E] text-white flex items-center gap-1 font-bold text-[10px]">
              <Layers className="w-3 h-3" />
              LAYER:
            </span>
            <button
              onClick={() => setMapStyle('satellite')}
              className={`px-2 py-1 transition text-[11px] font-semibold ${
                mapStyle === 'satellite' ? 'bg-[#C5432E] text-white' : 'text-[#173A5E] hover:bg-[#173A5E]/10'
              }`}
            >
              SATELLITE
            </button>
            <button
              onClick={() => setMapStyle('osm')}
              className={`px-2 py-1 transition text-[11px] font-semibold border-l border-[#173A5E]/30 ${
                mapStyle === 'osm' ? 'bg-[#173A5E] text-white' : 'text-[#173A5E] hover:bg-[#173A5E]/10'
              }`}
            >
              STREET
            </button>
            <button
              onClick={() => setMapStyle('dark')}
              className={`px-2 py-1 transition text-[11px] font-semibold border-l border-[#173A5E]/30 ${
                mapStyle === 'dark' ? 'bg-[#0E1A26] text-[#49D3E0]' : 'text-[#173A5E] hover:bg-[#173A5E]/10'
              }`}
            >
              DARK IR
            </button>
          </div>

          {/* Survivor Label Mode Controls */}
          <div className="flex items-center border border-[#173A5E] bg-[#F4F2EC] overflow-hidden">
            <span className="px-2 py-1 bg-[#173A5E] text-white flex items-center gap-1 font-bold text-[10px]">
              <Tag className="w-3 h-3" />
              LABELS:
            </span>
            <button
              onClick={() => setLabelMode('detailed')}
              className={`px-2 py-1 transition text-[11px] font-semibold ${
                labelMode === 'detailed' ? 'bg-[#173A5E] text-white' : 'text-[#173A5E] hover:bg-[#173A5E]/10'
              }`}
              title="Show permanent detailed floating tags with Lat/Lon on map"
            >
              ALWAYS FULL
            </button>
            <button
              onClick={() => setLabelMode('compact')}
              className={`px-2 py-1 transition text-[11px] font-semibold border-l border-[#173A5E]/30 ${
                labelMode === 'compact' ? 'bg-[#173A5E] text-white' : 'text-[#173A5E] hover:bg-[#173A5E]/10'
              }`}
              title="Show compact ID tags"
            >
              COMPACT
            </button>
            <button
              onClick={() => setLabelMode('hover')}
              className={`px-2 py-1 transition text-[11px] font-semibold border-l border-[#173A5E]/30 ${
                labelMode === 'hover' ? 'bg-[#173A5E] text-white' : 'text-[#173A5E] hover:bg-[#173A5E]/10'
              }`}
              title="Show info tags only when hovering over pins"
            >
              HOVER
            </button>
          </div>
        </div>
      </div>

      {/* Main Map Container & Overlay HUD */}
      <div className="relative w-full h-[380px] bg-[#0E1A26] border border-[#173A5E]">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Custom Zoom & Tactical Controls on Map */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="bg-[#0E1A26]/90 hover:bg-[#173A5E] text-white border border-[#3E6690] p-2 rounded shadow-md transition flex items-center justify-center"
            title="Zoom In (Sub-meter Precision)"
          >
            <ZoomIn className="w-4 h-4 text-[#49D3E0]" />
          </button>
          <button
            onClick={handleZoomOut}
            className="bg-[#0E1A26]/90 hover:bg-[#173A5E] text-white border border-[#3E6690] p-2 rounded shadow-md transition flex items-center justify-center"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-[#49D3E0]" />
          </button>
          <button
            onClick={handleResetView}
            className="bg-[#0E1A26]/90 hover:bg-[#173A5E] text-white border border-[#3E6690] p-2 rounded shadow-md transition flex items-center justify-center"
            title="Center Drone Base Position"
          >
            <Maximize2 className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Legend Overlay at Bottom Left of Map */}
        <div className="absolute bottom-3 left-3 z-[400] bg-[#0E1A26]/90 border border-[#3E6690] p-2 rounded text-[11px] font-mono text-white flex items-center gap-3 shadow-lg">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#C5432E] inline-block rounded-full animate-ping"></span>
            <span className="w-2.5 h-2.5 bg-[#C5432E] inline-block rounded-full -ml-3.5"></span>
            <span className="text-[#FFFAEE] font-bold">Unverified</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#B8862B] inline-block rounded-full"></span>
            <span className="text-amber-200">Dispatched</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#3E7A5C] inline-block rounded-full"></span>
            <span className="text-emerald-300">Rescued</span>
          </span>
        </div>

        {detections.length === 0 && (
          <div className="absolute inset-0 bg-[#0E1A26]/85 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center text-white pointer-events-none p-4 text-center">
            <UserCheck className="w-9 h-9 text-[#C5432E] mb-2 animate-bounce" />
            <p className="font-mono text-sm font-bold tracking-wider">NO HUMANS DETECTED YET</p>
            <p className="font-mono text-xs text-slate-300 mt-1 max-w-md">
              Start live webcam, connect drone feed, or upload media. All human detections (&gt;50% score) automatically project &amp; plot high-resolution GPS survivor pins here.
            </p>
          </div>
        )}
      </div>

      {/* Map Footer Metadata */}
      <div className="mt-2.5 text-xs font-mono text-[#5B6B7C] flex flex-wrap justify-between items-center gap-2">
        <span className="flex items-center gap-1">
          <Compass className="w-3.5 h-3.5 text-[#173A5E]" />
          PLOTTED SURVIVOR LOCATIONS: <b className="text-[#173A5E]">{detections.filter((d) => d.lat !== null).length}</b> / {detections.length}
        </span>
        {selectedLatLon && (
          <span className="text-[#C5432E] font-bold bg-[#C5432E]/10 px-2 py-0.5 border border-[#C5432E]/30 rounded">
            FOCUSED ON: {selectedLatLon.lat.toFixed(6)}, {selectedLatLon.lon.toFixed(6)}
          </span>
        )}
      </div>
    </div>
  );
};
