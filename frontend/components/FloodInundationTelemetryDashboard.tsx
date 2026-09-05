'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  CloudRain,
  Compass,
  Droplets,
  Eye,
  Gauge,
  Layers,
  MapPin,
  Minus,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Wind,
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// =========================================================
// 1. TypeScript Interfaces & Data Types
// =========================================================

export interface InundationTimeBand {
  id: string;
  label: string;
  hourStart: number;
  hourEnd: number;
  color: string;
  description: string;
}

export interface InundationZoneFeature {
  id: string;
  subRegionName: string;
  hourStart: number;
  hourEnd: number;
  color: string;
  floodDepthMeters: number;
  affectedPopulationEstimate: number;
  coordinates: [number, number][][]; // GeoJSON Polygon ring
}

export interface HydroWeatherTelemetry {
  timestamp: string;
  locationName: string;
  windSpeedKmH: number;
  windGustKmH: number;
  windDirectionDeg: number;
  relativeHumidityPercent: number;
  soilMoisturePercent: number;
  rainfallRateMmHr: number;
  rainfall24hMm: number;
  pressureHpa: number;
  pressureTrend: 'RISING' | 'FALLING' | 'STEADY';
  pressureDelta3h: number;
}

// =========================================================
// 2. Constants & Time-Series Presets
// =========================================================

export const INUNDATION_TIME_BANDS: InundationTimeBand[] = [
  { id: 'band-1', label: '0–10h', hourStart: 0, hourEnd: 10, color: '#ef4444', description: 'Critical Surge & River Breach' },
  { id: 'band-2', label: '10–20h', hourStart: 10, hourEnd: 20, color: '#f97316', description: 'Rapid Low-Lying Basin Overflow' },
  { id: 'band-3', label: '20–30h', hourStart: 20, hourEnd: 30, color: '#f59e0b', description: 'Secondary Canal Backflow' },
  { id: 'band-4', label: '30–40h', hourStart: 30, hourEnd: 40, color: '#3b82f6', description: 'Residential Drainage Saturation' },
  { id: 'band-5', label: '40–50h', hourStart: 40, hourEnd: 50, color: '#2563eb', description: 'Extended Basin Inundation' },
  { id: 'band-6', label: '50–68h', hourStart: 50, hourEnd: 68, color: '#1e3a8a', description: 'Maximum Lagoon & Wetland Retention' },
];

// Sample multi-stage chronological flood spread around Chennai coastal basin
export const SAMPLE_INUNDATION_ZONES: InundationZoneFeature[] = [
  {
    id: 'zone-0-10',
    subRegionName: 'Adyar River Breach Corridor',
    hourStart: 0,
    hourEnd: 10,
    color: '#ef4444',
    floodDepthMeters: 2.4,
    affectedPopulationEstimate: 18500,
    coordinates: [[
      [80.22, 13.01], [80.26, 13.02], [80.28, 13.00], [80.24, 12.98], [80.22, 13.01]
    ]],
  },
  {
    id: 'zone-10-20',
    subRegionName: 'Velachery Low Basin Overflow',
    hourStart: 10,
    hourEnd: 20,
    color: '#f97316',
    floodDepthMeters: 1.8,
    affectedPopulationEstimate: 34200,
    coordinates: [[
      [80.21, 12.97], [80.25, 12.98], [80.26, 12.94], [80.20, 12.93], [80.21, 12.97]
    ]],
  },
  {
    id: 'zone-20-30',
    subRegionName: 'Cooum South Spillway Zone',
    hourStart: 20,
    hourEnd: 30,
    color: '#f59e0b',
    floodDepthMeters: 1.2,
    affectedPopulationEstimate: 22100,
    coordinates: [[
      [80.25, 13.07], [80.29, 13.08], [80.30, 13.04], [80.26, 13.03], [80.25, 13.07]
    ]],
  },
  {
    id: 'zone-30-40',
    subRegionName: 'Madipakkam Residential Backflow',
    hourStart: 30,
    hourEnd: 40,
    color: '#3b82f6',
    floodDepthMeters: 0.9,
    affectedPopulationEstimate: 14800,
    coordinates: [[
      [80.18, 12.96], [80.21, 12.97], [80.22, 12.92], [80.17, 12.91], [80.18, 12.96]
    ]],
  },
  {
    id: 'zone-40-50',
    subRegionName: 'Perungudi Marsh Retention Zone',
    hourStart: 40,
    hourEnd: 50,
    color: '#2563eb',
    floodDepthMeters: 0.6,
    affectedPopulationEstimate: 8700,
    coordinates: [[
      [80.23, 12.95], [80.27, 12.96], [80.28, 12.90], [80.24, 12.89], [80.23, 12.95]
    ]],
  },
  {
    id: 'zone-50-68',
    subRegionName: 'Pallikaranai Wetland Maximum Extent',
    hourStart: 50,
    hourEnd: 68,
    color: '#1e3a8a',
    floodDepthMeters: 0.4,
    affectedPopulationEstimate: 4300,
    coordinates: [[
      [80.19, 12.93], [80.23, 12.94], [80.24, 12.87], [80.18, 12.86], [80.19, 12.93]
    ]],
  },
];

export const DEFAULT_TELEMETRY: HydroWeatherTelemetry = {
  timestamp: new Date().toISOString(),
  locationName: 'Chennai Coastal Radar & Hydro Sensor Array',
  windSpeedKmH: 38.5,
  windGustKmH: 58.2,
  windDirectionDeg: 215, // SW
  relativeHumidityPercent: 94,
  soilMoisturePercent: 88,
  rainfallRateMmHr: 42.8,
  rainfall24hMm: 145.2,
  pressureHpa: 996.4,
  pressureTrend: 'FALLING',
  pressureDelta3h: -4.5,
};

// =========================================================
// 3. Helper Functions
// =========================================================

export function degreesToCardinal(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(norm / 45) % 8];
}

interface DashboardProps {
  telemetry?: HydroWeatherTelemetry;
  inundationZones?: InundationZoneFeature[];
  mapCenter?: [number, number];
}

export const FloodInundationTelemetryDashboard: React.FC<DashboardProps> = ({
  telemetry = DEFAULT_TELEMETRY,
  inundationZones = SAMPLE_INUNDATION_ZONES,
  mapCenter = [80.24, 12.98],
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Time-Series Controls State
  const [currentHour, setCurrentHour] = useState<number>(24);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedZone, setSelectedZone] = useState<InundationZoneFeature | null>(null);

  // Playback Animation Effect
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentHour((prev) => {
        if (prev >= 68) {
          setIsPlaying(false);
          return 68;
        }
        return prev + 2;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: mapCenter,
      zoom: 11.5,
      pitch: 35,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      // Add Source for Time-Series Inundation Polygons
      map.addSource('inundation-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Polygon Fill Layer
      map.addLayer({
        id: 'inundation-fill',
        type: 'fill',
        source: 'inundation-source',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.75,
            0.5,
          ],
        },
      });

      // Polygon Border Outline Layer
      map.addLayer({
        id: 'inundation-outline',
        type: 'line',
        source: 'inundation-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });

      // Click listener on zone polygon
      map.on('click', 'inundation-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties as Record<string, unknown>;
          const zoneId = props.id as string;
          const match = inundationZones.find((z) => z.id === zoneId);
          if (match) setSelectedZone(match);
        }
      });

      map.on('mouseenter', 'inundation-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'inundation-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapCenter]);

  // Update Inundation Map Source on currentHour Change
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('inundation-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    // Filter zones where hourStart <= currentHour (zones that have flooded by current hour)
    const activeFeatures = inundationZones
      .filter((zone) => zone.hourStart <= currentHour)
      .map((zone) => ({
        type: 'Feature' as const,
        id: zone.id,
        geometry: {
          type: 'Polygon' as const,
          coordinates: zone.coordinates,
        },
        properties: {
          id: zone.id,
          subRegionName: zone.subRegionName,
          hourStart: zone.hourStart,
          hourEnd: zone.hourEnd,
          color: zone.color,
          floodDepthMeters: zone.floodDepthMeters,
          affectedPopulationEstimate: zone.affectedPopulationEstimate,
        },
      }));

    source.setData({
      type: 'FeatureCollection',
      features: activeFeatures,
    });
  }, [currentHour, inundationZones]);

  // Calculate cumulative stats up to currentHour
  const activeZones = inundationZones.filter((z) => z.hourStart <= currentHour);
  const totalPopulationAtRisk = activeZones.reduce((acc, z) => acc + z.affectedPopulationEstimate, 0);
  const maxDepth = activeZones.length > 0 ? Math.max(...activeZones.map((z) => z.floodDepthMeters)) : 0;

  return (
    <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-6 text-slate-100 shadow-2xl space-y-5 font-sans">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Flood Inundation & Hydro-Meteorological Telemetry
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
              LIVE PREDICTION
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Chronological flood wave propagation model (0–68 Hours) & operational telemetry feed
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentHour(0)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset (0h)
          </button>
        </div>
      </div>

      {/* 2. Main Dashboard Layout: Map Canvas + Scientific Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left/Center Column: Time-Series Inundation Map + Scrub Bar */}
        <div className="lg:col-span-8 space-y-4 flex flex-col">
          {/* Map Container Container */}
          <div className="relative w-full h-[380px] sm:h-[440px] rounded-2xl border border-slate-800 overflow-hidden bg-slate-900 shadow-inner">
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Map Overlay Badge: Active Hour Indicator */}
            <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-xl flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400 animate-pulse" />
              <span>Simulation Time:</span>
              <span className="text-blue-400 font-mono text-sm font-black">+{currentHour}h</span>
            </div>

            {/* Zone Metadata Inspection Card Overlay */}
            {selectedZone && (
              <div className="absolute bottom-4 left-4 z-10 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 p-3.5 rounded-2xl text-xs text-white max-w-xs shadow-2xl space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-slate-100 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-red-400" /> {selectedZone.subRegionName}
                  </span>
                  <button onClick={() => setSelectedZone(null)} className="text-slate-400 hover:text-white font-bold">
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div>Inundation Arrival: <strong className="text-blue-400 font-mono">+{selectedZone.hourStart}h</strong></div>
                  <div>Max Water Depth: <strong className="text-amber-400 font-mono">{selectedZone.floodDepthMeters}m</strong></div>
                  <div className="col-span-2">Est. Affected Population: <strong className="text-red-400 font-mono">{selectedZone.affectedPopulationEstimate.toLocaleString()}</strong></div>
                </div>
              </div>
            )}
          </div>

          {/* Time-Series Scrub Bar & Playback Controller */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 font-semibold text-slate-200">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all shadow-md ${
                    isPlaying ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{isPlaying ? 'Pause Simulation' : 'Play Propagation'}</span>
                </button>
                <span className="font-mono text-sm font-bold text-blue-400">T + {currentHour} Hours</span>
              </div>

              {/* Aggregated Quick Metrics */}
              <div className="flex items-center gap-4 text-[11px] font-medium text-slate-400">
                <div>Active Zones: <span className="font-bold text-white font-mono">{activeZones.length} / {inundationZones.length}</span></div>
                <div>Max Depth: <span className="font-bold text-amber-400 font-mono">{maxDepth.toFixed(1)}m</span></div>
                <div>Pop. At Risk: <span className="font-bold text-red-400 font-mono">{totalPopulationAtRisk.toLocaleString()}</span></div>
              </div>
            </div>

            {/* Range Scrub Slider */}
            <input
              type="range"
              min={0}
              max={68}
              step={1}
              value={currentHour}
              onChange={(e) => setCurrentHour(Number(e.target.value))}
              className="w-full h-2.5 rounded-full appearance-none cursor-pointer accent-blue-500 bg-slate-800 border border-slate-700"
            />

            {/* Legend Color Band Chips */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-[10px] pt-1">
              {INUNDATION_TIME_BANDS.map((band) => (
                <div
                  key={band.id}
                  onClick={() => setCurrentHour(band.hourEnd)}
                  className={`p-1.5 rounded-lg border text-center cursor-pointer transition-all ${
                    currentHour >= band.hourStart && currentHour <= band.hourEnd
                      ? 'bg-slate-800 border-white font-bold shadow-md scale-105'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: band.color }} />
                    <span className="font-mono text-white">{band.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Scientific Telemetry Operational Panel */}
        <div className="lg:col-span-4 space-y-3.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="font-bold text-xs text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Operational Hydro-Sensor Feed
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* 1. Wind & Vector Compass */}
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Wind className="w-3.5 h-3.5 text-sky-400" /> Wind Velocity
                </span>
                <span className="font-mono font-bold text-slate-200">{degreesToCardinal(telemetry.windDirectionDeg)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-black text-white font-mono">{telemetry.windSpeedKmH} <span className="text-xs font-normal text-slate-400">km/h</span></div>
                  <div className="text-[10px] text-slate-400">Gusts: <strong className="text-amber-400">{telemetry.windGustKmH} km/h</strong></div>
                </div>
                <div className="relative w-10 h-10 rounded-full border border-slate-700 bg-slate-900 flex items-center justify-center">
                  <Compass className="w-8 h-8 text-slate-700 absolute" />
                  <div
                    className="w-full h-full flex items-center justify-center transition-transform duration-500"
                    style={{ transform: `rotate(${telemetry.windDirectionDeg}deg)` }}
                  >
                    <div className="w-0.5 h-5 bg-sky-400 rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Rainfall Rate & Accumulation */}
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CloudRain className="w-3.5 h-3.5 text-blue-400" /> Precip Rate
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  HEAVY
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-black text-white font-mono">{telemetry.rainfallRateMmHr} <span className="text-xs font-normal text-slate-400">mm/hr</span></div>
                  <div className="text-[10px] text-slate-400">24h Total: <strong className="text-slate-200">{telemetry.rainfall24hMm} mm</strong></div>
                </div>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-orange-500 h-full rounded-full" style={{ width: `${Math.min(100, (telemetry.rainfallRateMmHr / 60) * 100)}%` }} />
              </div>
            </div>

            {/* 3. Barometric Pressure Trend */}
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Gauge className="w-3.5 h-3.5 text-indigo-400" /> Barometric Pressure
                </span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-300">
                  <ArrowDown className="w-3.5 h-3.5 text-red-400 animate-bounce" /> {telemetry.pressureTrend}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xl font-black text-white font-mono">{telemetry.pressureHpa} <span className="text-xs font-normal text-slate-400">hPa</span></div>
                <div className="text-xs font-mono font-bold text-red-400">{telemetry.pressureDelta3h} hPa / 3h</div>
              </div>
            </div>

            {/* 4. Relative Humidity & Soil Saturation */}
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Droplets className="w-3.5 h-3.5 text-teal-400" /> Soil Moisture & Humidity
                </span>
                <span className="text-[10px] font-bold text-red-400">88% SATURATED</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">Humidity</span>
                  <span className="font-bold text-white font-mono">{telemetry.relativeHumidityPercent}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Soil Saturation</span>
                  <span className="font-bold text-amber-400 font-mono">{telemetry.soilMoisturePercent}%</span>
                </div>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-teal-400 h-full rounded-full" style={{ width: `${telemetry.soilMoisturePercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
