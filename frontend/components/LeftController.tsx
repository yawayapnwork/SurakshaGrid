'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { CloudRain, ExternalLink, Play, QrCode, RotateCcw, Sliders, X } from 'lucide-react';

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
  // Off-canvas drawer state — only meaningful below the `lg` breakpoint; on desktop
  // the panel is always visible as a persistent sidebar regardless of this value.
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    // window.location is unavailable during SSR; this must run client-side after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from browser-only origin, no render-time alternative
    setReportUrl(`${window.location.origin}/report`);
  }, []);

  const isLiveMode = riskMode === 'live';

  return (
    <>
      {/* Mobile-only floating trigger — hidden on lg where the sidebar is persistent */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed bottom-5 left-4 z-30 min-h-[44px] min-w-[44px] flex items-center gap-2 px-4 rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/25 active:scale-95 transition-transform"
        aria-label="Open scenario controls"
      >
        <Sliders className="w-4 h-4" />
        <span className="text-xs font-semibold">Controls</span>
      </button>

      {/* Backdrop — mobile only, closes the drawer on tap */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm rounded-none border-r
          lg:static lg:inset-auto lg:z-auto lg:w-full lg:h-full lg:max-h-full lg:rounded-2xl lg:border
          transition-transform duration-300 ease-out lg:translate-x-0
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          overflow-y-auto custom-scrollbar bg-white border-slate-200/80 shadow-2xl lg:shadow-sm p-5 text-slate-900 space-y-5`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
              <Sliders className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div>
              <h2 className="font-semibold text-[13px] text-slate-900 tracking-tight">Scenario Controls</h2>
              <p className="text-[11px] text-slate-400">Configure the simulation parameters</p>
            </div>
          </div>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close scenario controls"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

      {/* 1. What-If Rainfall Slider & Live Mode Switch */}
      <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
        {/* Mode Toggle Switch */}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg gap-1">
          <button
            onClick={() => onRiskModeChange?.('simulated')}
            className={`min-h-[44px] flex-1 py-1.5 px-2.5 rounded-md text-[11.5px] font-semibold transition-all duration-150 ${
              !isLiveMode
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Simulated
          </button>
          <button
            onClick={() => onRiskModeChange?.('live')}
            className={`min-h-[44px] flex-1 py-1.5 px-2.5 rounded-md text-[11.5px] font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 ${
              isLiveMode
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isLiveMode ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            Live Feed
          </button>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
            <CloudRain className="w-3.5 h-3.5 text-slate-400" />
            {isLiveMode ? 'Live Ingested Rainfall' : 'What-If Rainfall Intensity'}
          </label>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-900 text-white tabular-nums">
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
          className={`w-full h-2 rounded-full appearance-none cursor-pointer accent-slate-900 transition-colors ${
            isLiveMode ? 'bg-slate-200 opacity-50 cursor-not-allowed' : 'bg-slate-200'
          }`}
        />

        <div className="flex justify-between text-[10px] text-slate-400 font-medium">
          <span>0% Dry</span>
          <span>50% Moderate</span>
          <span>100% Extreme</span>
        </div>

        {/* Live Weather Feed Badge */}
        <div className="pt-3 border-t border-slate-200/80">
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600 bg-white border border-slate-200/80 px-2.5 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
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
          className="min-h-[44px] w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-1"
        >
          <span className={`w-1.5 h-1.5 rounded-full bg-amber-500 ${isTriggering ? 'animate-ping' : ''}`} />
          {isTriggering ? 'Scenario running…' : 'Trigger Flood Event Scenario'}
        </button>

        <button
          onClick={onResetScenario}
          disabled={isTriggering || isResetting}
          className="min-h-[44px] w-full py-2 px-4 rounded-xl bg-transparent hover:bg-slate-50 text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200 font-medium text-xs flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          {isResetting ? 'Wiping demo state…' : 'Reset Scenario State'}
        </button>
      </div>

      {/* 3. Run Rescue Dispatch — the single primary CTA, deliberately the only accent
          color in an otherwise neutral slate/white panel so it reads as THE action. */}
      <button
        onClick={onRunDispatch}
        disabled={isDispatching}
        className="min-h-[44px] w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-[13px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-150 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-sm disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50 focus-visible:ring-offset-2"
      >
        <Play className="w-4 h-4 fill-current" />
        {isDispatching ? 'Solving dispatch assignment…' : 'Run Rescue Dispatch'}
      </button>

      {/* 4. Citizen SOS QR Code & Live Mobile Reporting Link */}
      <div className="space-y-2 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700">
          <QrCode className="w-3.5 h-3.5 text-slate-400" />
          <span>Scan to file a live SOS report</span>
        </div>
        <div className="flex justify-center py-1">
          <div className="p-1.5 bg-white rounded-lg shadow-xs border border-slate-200/80 inline-block">
            <Image
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(reportUrl)}`}
              alt="Scan QR code to open Citizen SOS report form"
              width={110}
              height={110}
              unoptimized
              className="w-24 h-24 object-contain"
            />
          </div>
        </div>
        <a
          href="/report"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline"
        >
          Open Citizen SOS Form <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      </aside>
    </>
  );
};
