'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CloudRain,
  Compass,
  Droplets,
  Gauge,
  Minus,
  RefreshCw,
  Wind,
} from 'lucide-react';

// ==========================================
// 1. TypeScript Interfaces for Telemetry
// ==========================================

export interface WindMetrics {
  speedKmH: number;
  gustKmH: number;
  directionDegrees: number; // 0..360
  heading: string; // N, NE, E, SE, S, SW, W, NW
}

export interface RainfallMetrics {
  currentRateMmHr: number; // mm/hr
  cumulative24hMm: number;
  severity: 'LIGHT' | 'MODERATE' | 'HEAVY' | 'TORRENTIAL';
}

export interface AtmosphericMetrics {
  pressureHpa: number; // e.g. 1008.5
  pressureTrend: 'RISING' | 'FALLING' | 'STEADY';
  pressureDelta3h: number; // e.g. -4.2 hPa
  humidityPercent: number; // 0..100
  dewPointC: number;
}

export interface SoilHydrologyMetrics {
  soilSaturationPercent: number; // 0..100
  absorptionRateMmHr: number;
  surfaceRunoffPotential: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  groundwaterTableMeters: number;
}

export interface ScientificTelemetryPayload {
  timestamp: string;
  stationId: string;
  stationName: string;
  wind: WindMetrics;
  rainfall: RainfallMetrics;
  atmospheric: AtmosphericMetrics;
  soil: SoilHydrologyMetrics;
}

// ==========================================
// 2. Accurate SVG Vector Wind Arrow Component
// ==========================================

export interface WindVectorBarbProps {
  speedKmH: number;
  directionDegrees: number;
  size?: number;
  color?: string;
}

export const WindVectorBarb: React.FC<WindVectorBarbProps> = ({
  speedKmH,
  directionDegrees,
  size = 32,
  color = '#38bdf8',
}) => {
  const strokeWidth = Math.min(3.2, Math.max(1.8, 1.5 + speedKmH / 30));

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="transition-transform duration-700 ease-out shrink-0"
      style={{ transform: `rotate(${directionDegrees}deg)` }}
    >
      {/* Central Vector Shaft */}
      <line x1="12" y1="21" x2="12" y2="4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Arrowhead Pointing in Flow Direction */}
      <polyline points="6 10 12 3 18 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {/* Meteorological Tail Barbs scaling with wind speed */}
      {speedKmH > 20 && (
        <line x1="12" y1="15" x2="18" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      )}
      {speedKmH > 40 && (
        <line x1="12" y1="18" x2="18" y2="15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      )}
    </svg>
  );
};

// ==========================================
// 3. Helper Calculation Functions
// ==========================================

export function degreesToCompassHeading(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

export function evaluateRainfallSeverity(mmHr: number): 'LIGHT' | 'MODERATE' | 'HEAVY' | 'TORRENTIAL' {
  if (mmHr < 7.5) return 'LIGHT';
  if (mmHr < 35.0) return 'MODERATE';
  if (mmHr < 75.0) return 'HEAVY';
  return 'TORRENTIAL';
}

export function evaluateRunoffRisk(saturationPercent: number): 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' {
  if (saturationPercent < 40) return 'LOW';
  if (saturationPercent < 70) return 'MODERATE';
  if (saturationPercent < 88) return 'HIGH';
  return 'EXTREME';
}

// Default baseline telemetry payload for EOC display
const DEFAULT_TELEMETRY: ScientificTelemetryPayload = {
  timestamp: new Date().toISOString(),
  stationId: 'EOC-CH-04',
  stationName: 'Chennai Coastal Radar & Hydro Station',
  wind: {
    speedKmH: 34.2,
    gustKmH: 52.8,
    directionDegrees: 225, // SW
    heading: 'SW',
  },
  rainfall: {
    currentRateMmHr: 48.5,
    cumulative24hMm: 132.4,
    severity: 'HEAVY',
  },
  atmospheric: {
    pressureHpa: 998.2,
    pressureTrend: 'FALLING',
    pressureDelta3h: -4.8,
    humidityPercent: 92,
    dewPointC: 24.5,
  },
  soil: {
    soilSaturationPercent: 86,
    absorptionRateMmHr: 4.2,
    surfaceRunoffPotential: 'HIGH',
    groundwaterTableMeters: 0.45,
  },
};

interface ScientificTelemetryMetricsProps {
  telemetry?: ScientificTelemetryPayload | null;
  onRefresh?: () => void;
  isStreaming?: boolean;
}

export const ScientificTelemetryMetrics: React.FC<ScientificTelemetryMetricsProps> = ({
  telemetry = DEFAULT_TELEMETRY,
  onRefresh,
  isStreaming = true,
}) => {
  const data = telemetry || DEFAULT_TELEMETRY;
  const [pulse, setPulse] = useState(false);

  // Micro-pulse every 3 seconds to indicate live telemetry feed
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse((p) => !p);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const rainfallSev = evaluateRainfallSeverity(data.rainfall.currentRateMmHr);
  const runoffRisk = evaluateRunoffRisk(data.soil.soilSaturationPercent);

  // Severity style mappings
  const rainfallBadgeColor = {
    LIGHT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    MODERATE: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    HEAVY: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    TORRENTIAL: 'bg-red-500/20 text-red-300 border-red-500/30 animate-pulse',
  }[rainfallSev];

  const runoffBadgeColor = {
    LOW: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    MODERATE: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    HIGH: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    EXTREME: 'bg-red-500/20 text-red-300 border-red-500/30 animate-pulse',
  }[runoffRisk];

  return (
    <div className="w-full bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 sm:p-5 text-slate-100 shadow-2xl space-y-4 font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm tracking-tight text-white">Scientific Telemetry & Hydro Metrics</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {data.stationId}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">{data.stationName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Data Pulse */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/80 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                isStreaming
                  ? pulse
                    ? 'bg-emerald-400 scale-125 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : 'bg-emerald-500'
                  : 'bg-slate-500'
              }`}
            />
            <span className="font-medium text-slate-300">{isStreaming ? 'Live Stream' : 'Paused'}</span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Refresh telemetry feed"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4 Primary Telemetry Indicator Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. Wind Vector & Velocity */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold">
              <Wind className="w-3.5 h-3.5 text-sky-400" /> Airflow & Wind
            </span>
            <span className="font-mono text-[11px] text-slate-300 font-bold">{data.wind.heading}</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="text-2xl font-black text-white tabular-nums tracking-tight">
                {data.wind.speedKmH}{' '}
                <span className="text-xs font-normal text-slate-400">km/h</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Gusts up to <span className="font-bold text-amber-400">{data.wind.gustKmH} km/h</span>
              </div>
            </div>

            {/* Dynamic Compass Rose Vector Arrow Component */}
            <div className="relative w-12 h-12 rounded-full border-2 border-slate-700 flex items-center justify-center bg-slate-900/80 shadow-inner">
              <Compass className="w-10 h-10 text-slate-700/40 absolute" />
              <WindVectorBarb
                speedKmH={data.wind.speedKmH}
                directionDegrees={data.wind.directionDegrees}
                size={28}
                color="#38bdf8"
              />
            </div>
          </div>
        </div>

        {/* 2. Rainfall Intensity & Accumulation */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2 relative">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold">
              <CloudRain className="w-3.5 h-3.5 text-blue-400" /> Precip Rate
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rainfallBadgeColor}`}>
              {rainfallSev}
            </span>
          </div>

          <div className="pt-1">
            <div className="text-2xl font-black text-white tabular-nums tracking-tight">
              {data.rainfall.currentRateMmHr}{' '}
              <span className="text-xs font-normal text-slate-400">mm/hr</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>24h Cumulative:</span>
              <span className="font-bold text-slate-200">{data.rainfall.cumulative24hMm} mm</span>
            </div>
          </div>
        </div>

        {/* 3. Barometric Pressure & Trend */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2 relative">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold">
              <Gauge className="w-3.5 h-3.5 text-purple-400" /> Barometric Pressure
            </span>
            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-300 font-bold">
              {data.atmospheric.pressureTrend === 'RISING' && <ArrowUp className="w-3 h-3 text-emerald-400" />}
              {data.atmospheric.pressureTrend === 'FALLING' && <ArrowDown className="w-3 h-3 text-red-400" />}
              {data.atmospheric.pressureTrend === 'STEADY' && <Minus className="w-3 h-3 text-slate-400" />}
              <span>{data.atmospheric.pressureTrend}</span>
            </div>
          </div>

          <div className="pt-1">
            <div className="text-2xl font-black text-white tabular-nums tracking-tight">
              {data.atmospheric.pressureHpa}{' '}
              <span className="text-xs font-normal text-slate-400">hPa</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>3h Change:</span>
              <span
                className={`font-mono font-bold ${
                  data.atmospheric.pressureDelta3h < 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {data.atmospheric.pressureDelta3h > 0 ? '+' : ''}
                {data.atmospheric.pressureDelta3h} hPa
              </span>
            </div>
          </div>
        </div>

        {/* 4. Soil Saturation & Runoff Potential */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2 relative">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold">
              <Droplets className="w-3.5 h-3.5 text-teal-400" /> Soil Saturation
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${runoffBadgeColor}`}>
              {runoffRisk} RUNOFF
            </span>
          </div>

          <div className="pt-1 space-y-1">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-black text-white tabular-nums tracking-tight">
                {data.soil.soilSaturationPercent}%
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Groundwater: {data.soil.groundwaterTableMeters}m
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden border border-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  data.soil.soilSaturationPercent > 85
                    ? 'bg-red-500'
                    : data.soil.soilSaturationPercent > 70
                    ? 'bg-orange-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, data.soil.soilSaturationPercent))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
