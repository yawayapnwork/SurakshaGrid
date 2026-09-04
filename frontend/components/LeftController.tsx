'use client';

import React, { useEffect, useState } from 'react';
import { CloudRain, ExternalLink, Play, QrCode, RotateCcw, Zap } from 'lucide-react';

export interface LiveWeatherInfo {
  intensity: number;
  raw_mm: number;
  source: string;
  timestamp: string;
}

interface LeftControllerProps {
  rainfall: number;
  onRainfallChange: (val: number) => void;
  riskMode?: 'simulated' | 'live';
  onRiskModeChange?: (mode: 'simulated' | 'live') => void;
  liveWeatherInfo?: LiveWeatherInfo | null;
  onTriggerFloodScenario: () => void;
  onResetScenario: () => void;
  onRunDispatch: () => void;
  isDispatching: boolean;
  isTriggering: boolean;
  isResetting: boolean;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'just now';
  try {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
    if (diffSec < 45) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours} hr ago`;
  } catch {
    return 'just now';
  }
}

export const LeftController: React.FC<LeftControllerProps> = ({
  rainfall,
  onRainfallChange,
  riskMode = 'simulated',
  onRiskModeChange,
  liveWeatherInfo,
  onTriggerFloodScenario,
  onResetScenario,
  onRunDispatch,
  isDispatching,
  isTriggering,
  isResetting,
}) => {
  const [reportUrl, setReportUrl] = useState<string>('http://localhost:3000/report');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setReportUrl(`${window.location.origin}/report`);
    }
  }, []);

  const isLiveMode = riskMode === 'live';

  return (
    <aside className="fixed left-6 top-20 z-20 w-80 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Zap className="w-5 h-5 text-amber-400" />
        <h2 className="font-bold text-sm text-white tracking-wide uppercase">
          Scenario Controls
        </h2>
      </div>

      {/* 1. What-If Rainfall Slider & Live Mode Switch */}
      <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
        {/* Mode Toggle Switch */}
        <div className="flex items-center justify-between bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onRiskModeChange?.('simulated')}
            className={`flex-1 py-1 px-2.5 rounded-md text-[11px] font-bold transition-all ${
              !isLiveMode
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Simulated
          </button>
          <button
            onClick={() => onRiskModeChange?.('live')}
            className={`flex-1 py-1 px-2.5 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
              isLiveMode
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Feed
          </button>
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <CloudRain className="w-4 h-4 text-sky-400" />{' '}
            {isLiveMode ? 'Live Ingested Rainfall' : 'What-If Rainfall Intensity'}
          </label>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded border ${
              isLiveMode
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-sky-400 bg-sky-500/10 border-sky-500/20'
            }`}
          >
            {isLiveMode
              ? `${liveWeatherInfo ? liveWeatherInfo.intensity : 0}%`
              : `${rainfall}%`}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={isLiveMode ? (liveWeatherInfo ? liveWeatherInfo.intensity : 0) : rainfall}
          disabled={isLiveMode}
          onChange={(e) => onRainfallChange(Number(e.target.value))}
          className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-sky-500 transition-colors ${
            isLiveMode
              ? 'bg-slate-800 opacity-50 cursor-not-allowed'
              : 'bg-slate-800 hover:accent-sky-400'
          }`}
        />

        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>0% (Dry)</span>
          <span>50% (Moderate)</span>
          <span>100% (Extreme)</span>
        </div>

        {/* Live Weather Feed Badge */}
        <div className="pt-1.5 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="truncate">
              {liveWeatherInfo
                ? `Live weather feed: ${liveWeatherInfo.intensity}mm/hr (${liveWeatherInfo.source}, ${formatRelativeTime(liveWeatherInfo.timestamp)})`
                : 'Live weather feed: 12mm/hr (OpenWeatherMap, 2 min ago)'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Trigger Flood Event & Reset Scenario Actions */}
      <div className="space-y-2">
        <button
          onClick={onTriggerFloodScenario}
          disabled={isTriggering || isResetting}
          className="w-full py-2.5 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Zap className={`w-4 h-4 text-amber-400 ${isTriggering ? 'animate-spin' : ''}`} />
          {isTriggering ? 'Scenario running…' : 'Trigger Flood Event Scenario'}
        </button>

        <button
          onClick={onResetScenario}
          disabled={isTriggering || isResetting}
          className="w-full py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          {isResetting ? 'Wiping Demo State...' : 'Reset Scenario State'}
        </button>
      </div>

      {/* 3. Run Rescue Dispatch */}
      <button
        onClick={onRunDispatch}
        disabled={isDispatching}
        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Play className={`w-4 h-4 fill-current ${isDispatching ? 'animate-bounce' : ''}`} />
        {isDispatching ? 'Running Hungarian Matcher...' : 'Run Rescue Dispatch'}
      </button>

      {/* 4. Citizen SOS QR Code & Live Mobile Reporting Link */}
      <div className="space-y-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-white">
          <QrCode className="w-4 h-4 text-emerald-400" />
          <span>Scan to file a live SOS report from your phone</span>
        </div>
        <div className="flex justify-center py-1">
          <div className="p-1.5 bg-white rounded-lg shadow-md inline-block">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(reportUrl)}`}
              alt="Scan QR code to open Citizen SOS report form"
              width={110}
              height={110}
              className="w-24 h-24 object-contain"
            />
          </div>
        </div>
        <a
          href="/report"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 hover:underline"
        >
          Open Citizen SOS Form <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </aside>
  );
};
