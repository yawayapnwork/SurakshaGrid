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
  <div className="flex items-center gap-3 bg-slate-50/70 px-3.5 py-2 rounded-xl border border-slate-200/70">
    <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${iconClass}`}>
      {icon}
    </div>
    <div className="leading-tight">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400 block">{label}</span>
      <span className="text-sm font-semibold text-slate-900 transition-all duration-300">{children}</span>
    </div>
  </div>
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
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-600 hover:text-slate-900 shadow-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-1';

  return (
    <header className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 text-slate-900 px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-30 relative">
      {/* Brand Title & Live Status */}
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-sm shadow-indigo-600/20">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-[15px] tracking-tight text-slate-900 flex items-center gap-2">
            SurakshaGrid
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-semibold border border-slate-200/80">
              v1.0
            </span>
          </h1>
          <p className="text-xs text-slate-400">Flood Intelligence & Emergency Dispatch System</p>
        </div>
      </div>

      {/* Stats Counter Grid */}
      <div className="flex items-center gap-2.5 text-sm">
        <StatCard icon={<Activity className="w-4 h-4 text-emerald-600" />} iconClass="bg-emerald-50" label="Monitored Area">
          {monitoredAreaKm2} km²
        </StatCard>

        <StatCard icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} iconClass="bg-amber-50" label="Active SOS">
          {activeSosCount} {criticalCount > 0 && <span className="text-red-600 font-semibold">({criticalCount} critical)</span>}
        </StatCard>

        <StatCard icon={<Navigation className="w-4 h-4 text-indigo-600" />} iconClass="bg-indigo-50" label="Dispatched Units">
          {dispatchedUnitsCount} Units
        </StatCard>

        <StatCard icon={<Clock className="w-4 h-4 text-slate-500" />} iconClass="bg-slate-100" label="Avg Dispatch ETA">
          {avgEtaMinutes.toFixed(1)} mins
        </StatCard>
      </div>

      {/* Actions: Run 60s Demo, Export AAR Report, Sound Toggle, Connection Badge */}
      <div className="flex items-center gap-2">
        {/* Guided Demo 60s Runner Control */}
        {demoState && (
          demoState.isRunning ? (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
              <div className="flex flex-col min-w-[120px]">
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
                  <span>DEMO ({demoState.currentStepIndex + 1}/{demoState.totalSteps})</span>
                  <span>{demoState.progressPercent}%</span>
                </div>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                    style={{ width: `${demoState.progressPercent}%` }}
                  />
                </div>
              </div>
              {demoState.isPaused ? (
                <button
                  onClick={demoState.resumeDemo}
                  className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-emerald-600 transition-all"
                  title="Resume Guided Demo"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={demoState.pauseDemo}
                  className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-all"
                  title="Pause Guided Demo"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                </button>
              )}
              <button
                onClick={demoState.cancelDemo}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-all"
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
              <Play className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
              <span>Run 60s Demo</span>
            </button>
          )
        )}

        {/* Export AAR Button */}
        {onOpenAARModal && (
          <button onClick={onOpenAARModal} className={ghostBtn}>
            <FileText className="w-4 h-4 text-slate-400" />
            <span>Export AAR</span>
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
          <QrCode className="w-4 h-4 text-slate-400" />
          <span>Citizen SOS</span>
        </a>

        {/* Audio Siren Mute/Unmute Toggle Button */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Emergency Siren Alerts' : 'Mute Emergency Siren Alerts'}
          className={ghostBtn}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-4 h-4 text-slate-400" />
              <span>Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span>Sound On</span>
            </>
          )}
        </button>

        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {isReplayMode ? (
          <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/70">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Replay Mode
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            {isConnected ? 'Live' : 'Connecting…'}
          </span>
        )}
      </div>
    </header>
  );
};
