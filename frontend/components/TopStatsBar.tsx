'use client';

import React from 'react';
import { Activity, AlertTriangle, Clock, FileText, Navigation, Pause, Play, QrCode, ShieldCheck, Square, Volume2, VolumeX } from 'lucide-react';

export interface TopStatsBarProps {
  monitoredAreaKm2?: number;
  activeSosCount: number;
  criticalCount: number;
  dispatchedUnitsCount: number;
  avgEtaMinutes: number;
  isConnected: boolean;
  isReplayMode: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenAARModal?: () => void;
  demoState?: {
    isRunning: boolean;
    isPaused: boolean;
    currentStepIndex: number;
    totalSteps: number;
    progressPercent: number;
    startDemo: () => void;
    pauseDemo: () => void;
    resumeDemo: () => void;
    cancelDemo: () => void;
  };
}

const StatCard: React.FC<{
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  children: React.ReactNode;
}> = ({ icon, iconClass, label, children }) => (
  <div className="flex items-center gap-2.5 sm:gap-3 bg-white px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200 min-w-0">
    <div className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-lg flex items-center justify-center ${iconClass}`}>
      {icon}
    </div>
    <div className="leading-tight min-w-0">
      <span className="text-[9.5px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 block truncate">
        {label}
      </span>
      <span className="text-[13px] sm:text-[15px] font-bold text-slate-900 tabular-nums transition-all duration-300 truncate block">
        {children}
      </span>
    </div>
  </div>
);

const ConnectionBadge: React.FC<{ isReplayMode: boolean; isConnected: boolean }> = ({ isReplayMode, isConnected }) =>
  isReplayMode ? (
    <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
      Replay Mode
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
      {isConnected ? 'Live' : 'Connecting…'}
    </span>
  );

export const TopStatsBar: React.FC<TopStatsBarProps> = ({
  monitoredAreaKm2 = 42.5,
  activeSosCount,
  criticalCount,
  dispatchedUnitsCount,
  avgEtaMinutes,
  isConnected,
  isReplayMode,
  isMuted,
  onToggleMute,
  onOpenAARModal,
  demoState,
}) => {
  const ghostBtn =
    'min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-600 hover:text-slate-900 shadow-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-1';

  return (
    <header className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 text-slate-900 px-4 sm:px-6 py-3 sm:py-3.5 z-30 relative shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-x-hidden">
      {/* Single unified row: brand (left) — stats — actions (right). Each group is one
          flex-wrap item, so on a squeeze the WHOLE group drops to its own line instead
          of individual buttons breaking into a vertical stack inside a shrunken column. */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="bg-slate-900 text-white p-1.5 sm:p-2 rounded-xl shrink-0">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm sm:text-[15px] tracking-tight text-slate-900 flex items-center gap-2">
              <span className="truncate">SurakshaGrid</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-semibold border border-slate-200/80 shrink-0">
                v1.0
              </span>
            </h1>
            <p className="hidden sm:block text-xs text-slate-400 truncate">Flood Intelligence & Emergency Dispatch System</p>
          </div>
        </div>

        {/* Connection badge — mobile/tablet only; the desktop instance lives at the end
            of the actions row below, so this stays out of the way at lg. */}
        <div className="lg:hidden shrink-0">
          <ConnectionBadge isReplayMode={isReplayMode} isConnected={isConnected} />
        </div>

        {/* Stats — full-width block below `lg` (forces its own line when wrapped),
            shrink-to-fit inline row at `lg` and up */}
        <div className="w-full lg:w-auto grid grid-cols-2 sm:grid-cols-4 lg:flex lg:items-center gap-2 sm:gap-2.5 lg:gap-3 text-sm">
          <StatCard icon={<Activity className="w-4 h-4 text-sky-600" />} iconClass="bg-sky-50" label="Monitored Area">
            {monitoredAreaKm2} km²
          </StatCard>

          <StatCard
            icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
            iconClass="bg-amber-50"
            label="Active SOS"
          >
            {activeSosCount} {criticalCount > 0 && <span className="text-red-600 font-semibold">({criticalCount} critical)</span>}
          </StatCard>

          <StatCard icon={<Navigation className="w-4 h-4 text-indigo-600" />} iconClass="bg-indigo-50" label="Dispatched Units">
            {dispatchedUnitsCount} Units
          </StatCard>

          <StatCard icon={<Clock className="w-4 h-4 text-emerald-600" />} iconClass="bg-emerald-50" label="Avg Dispatch ETA">
            {avgEtaMinutes.toFixed(1)} mins
          </StatCard>
        </div>

        {/* Actions — full-width block below `lg` (own line, buttons wrap freely inside
            it without affecting siblings), shrink-to-fit inline row at `lg` and up */}
        <div className="w-full lg:w-auto flex flex-wrap items-center gap-2">
          {/* Guided Demo 60s Runner Control */}
          {demoState && (
            demoState.isRunning ? (
              <div className="min-h-[44px] flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
                <div className="flex flex-col min-w-[90px] sm:min-w-[120px]">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
                    <span>DEMO ({demoState.currentStepIndex + 1}/{demoState.totalSteps})</span>
                    <span>{demoState.progressPercent}%</span>
                  </div>
                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-slate-900 transition-all duration-300 rounded-full"
                      style={{ width: `${demoState.progressPercent}%` }}
                    />
                  </div>
                </div>
                {demoState.isPaused ? (
                  <button
                    onClick={demoState.resumeDemo}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 hover:text-emerald-600 transition-all"
                    title="Resume Guided Demo"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={demoState.pauseDemo}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-all"
                    title="Pause Guided Demo"
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
                <button
                  onClick={demoState.cancelDemo}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-all"
                  title="Cancel Guided Demo"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            ) : (
              <button
                onClick={demoState.startDemo}
                className={ghostBtn}
                title="Run 60s Automated Hackathon Judging Script (PRD §8)"
              >
                <Play className="w-3.5 h-3.5 text-slate-700 fill-slate-700 shrink-0" />
                <span className="hidden sm:inline">Run 60s Demo</span>
              </button>
            )
          )}

          {/* Export AAR Button */}
          {onOpenAARModal && (
            <button onClick={onOpenAARModal} className={ghostBtn}>
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="hidden sm:inline">Export AAR</span>
            </button>
          )}

          {/* Citizen SOS Direct Form & Mobile Link */}
          <a
            href="/report"
            target="_blank"
            rel="noopener noreferrer"
            className={ghostBtn}
            title="Open Citizen SOS Emergency Reporting Form"
          >
            <QrCode className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="hidden sm:inline">Citizen SOS</span>
          </a>

          {/* Audio Siren Mute/Unmute Toggle Button */}
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute Emergency Siren Alerts' : 'Mute Emergency Siren Alerts'}
            className={ghostBtn}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="hidden sm:inline">Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline">Sound On</span>
              </>
            )}
          </button>

          <div className="hidden lg:block w-px h-5 bg-slate-200 mx-0.5" />

          <div className="hidden lg:block">
            <ConnectionBadge isReplayMode={isReplayMode} isConnected={isConnected} />
          </div>
        </div>
      </div>
    </header>
  );
};
