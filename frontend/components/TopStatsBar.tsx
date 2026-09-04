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
  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900 px-6 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3 z-30 relative">
      {/* Brand Title & Live Status */}
      <div className="flex items-center gap-3">
        <div className="bg-blue-50 text-blue-600 p-2 rounded-xl border border-blue-200">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-extrabold text-lg tracking-wide text-[#0F172A] flex items-center gap-2">
            SurakshaGrid
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold border border-blue-200">
              v1.0
            </span>
          </h1>
          <p className="text-xs text-[#475569]">Flood Intelligence & Emergency Dispatch System</p>
        </div>
      </div>

      {/* Stats Counter Grid with Micro-Animations */}
      <div className="flex items-center gap-4 text-sm">
        {/* Monitored Area */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
          <Activity className="w-4 h-4 text-emerald-600" />
          <div>
            <span className="text-xs text-[#475569] block">Monitored Area</span>
            <span className="font-bold text-[#0F172A] transition-all duration-300">{monitoredAreaKm2} km²</span>
          </div>
        </div>

        {/* Active SOS Reports */}
        <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <div>
            <span className="text-xs text-amber-700/80 block">Active SOS</span>
            <span className="font-bold text-amber-700 transition-all duration-300">
              {activeSosCount} {criticalCount > 0 && <span className="text-red-600 font-extrabold">({criticalCount} Critical)</span>}
            </span>
          </div>
        </div>

        {/* Dispatched Units */}
        <div className="flex items-center gap-2 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200">
          <Navigation className="w-4 h-4 text-sky-600" />
          <div>
            <span className="text-xs text-sky-700/80 block">Dispatched Units</span>
            <span className="font-bold text-sky-700 transition-all duration-300">{dispatchedUnitsCount} Units</span>
          </div>
        </div>

        {/* Avg Route ETA */}
        <div className="flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200">
          <Clock className="w-4 h-4 text-purple-600" />
          <div>
            <span className="text-xs text-purple-700/80 block">Avg Dispatch ETA</span>
            <span className="font-bold text-purple-700 transition-all duration-300">{avgEtaMinutes.toFixed(1)} mins</span>
          </div>
        </div>
      </div>

      {/* Actions: Run 60s Demo, Export AAR Report, Sound Toggle, Connection Badge */}
      <div className="flex items-center gap-3">
        {/* Guided Demo 60s Runner Control */}
        {demoState && (
          demoState.isRunning ? (
            <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 shadow-sm">
              <div className="flex flex-col min-w-[120px]">
                <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold text-amber-700">
                  <span>DEMO ({demoState.currentStepIndex + 1}/{demoState.totalSteps})</span>
                  <span>{demoState.progressPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-amber-100 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300 rounded-full"
                    style={{ width: `${demoState.progressPercent}%` }}
                  />
                </div>
              </div>
              {demoState.isPaused ? (
                <button
                  onClick={demoState.resumeDemo}
                  className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-200 transition-all"
                  title="Resume Guided Demo"
                >
                  <Play className="w-3.5 h-3.5 fill-emerald-700 text-emerald-700" />
                </button>
              ) : (
                <button
                  onClick={demoState.pauseDemo}
                  className="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-200 transition-all"
                  title="Pause Guided Demo"
                >
                  <Pause className="w-3.5 h-3.5 fill-amber-700 text-amber-700" />
                </button>
              )}
              <button
                onClick={demoState.cancelDemo}
                className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 transition-all"
                title="Cancel Guided Demo"
              >
                <Square className="w-3.5 h-3.5 fill-red-700 text-red-700" />
              </button>
            </div>
          ) : (
            <button
              onClick={demoState.startDemo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 hover:border-amber-300 text-xs font-extrabold shadow-sm transition-all"
              title="Run 60s Automated Hackathon Judging Script (PRD §8)"
            >
              <Play className="w-3.5 h-3.5 text-amber-600 fill-amber-600" />
              <span>Run 60s Demo</span>
            </button>
          )
        )}

        {/* Export AAR Button */}
        {onOpenAARModal && (
          <button
            onClick={onOpenAARModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 hover:border-sky-300 text-xs font-semibold transition-all shadow-sm"
          >
            <FileText className="w-4 h-4 text-sky-600" />
            <span>Export AAR</span>
          </button>
        )}

        {/* Citizen SOS Direct Form & Mobile Link */}
        <a
          href="/report"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 hover:border-red-300 text-xs font-semibold transition-all shadow-sm"
          title="Open Citizen SOS Emergency Reporting Form"
        >
          <QrCode className="w-4 h-4 text-red-600" />
          <span>Citizen SOS</span>
        </a>

        {/* Audio Siren Mute/Unmute Toggle Button */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Emergency Siren Alerts' : 'Mute Emergency Siren Alerts'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            isMuted
              ? 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-700'
              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
          }`}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-4 h-4 text-slate-500" />
              <span>Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 text-red-600" />
              <span>Sound ON</span>
            </>
          )}
        </button>

        {isReplayMode ? (
          <span className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            REPLAY MODE
          </span>
        ) : (
          <span className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${
            isConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {isConnected ? 'LIVE WEBSOCKET' : 'CONNECTING...'}
          </span>
        )}
      </div>
    </header>
  );
};

