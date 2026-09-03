'use client';

import React from 'react';
import { Activity, AlertTriangle, Clock, FileText, Navigation, ShieldCheck, Volume2, VolumeX } from 'lucide-react';

interface TopStatsBarProps {
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
}) => {
  return (
    <header className="w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800 text-slate-100 px-6 py-3 shadow-lg flex flex-wrap items-center justify-between z-30 relative">
      {/* Brand Title & Live Status */}
      <div className="flex items-center gap-3">
        <div className="bg-sky-500/20 text-sky-400 p-2 rounded-xl border border-sky-500/30">
          <ShieldCheck className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="font-extrabold text-lg tracking-wide text-white flex items-center gap-2">
            SurakshaGrid
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
              v1.0
            </span>
          </h1>
          <p className="text-xs text-slate-400">Flood Intelligence & Emergency Dispatch System</p>
        </div>
      </div>

      {/* Stats Counter Grid with Micro-Animations */}
      <div className="flex items-center gap-6 text-sm">
        {/* Monitored Area */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
          <Activity className="w-4 h-4 text-emerald-400" />
          <div>
            <span className="text-xs text-slate-400 block">Monitored Area</span>
            <span className="font-bold text-slate-200 transition-all duration-300">{monitoredAreaKm2} km²</span>
          </div>
        </div>

        {/* Active SOS Reports */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <div>
            <span className="text-xs text-slate-400 block">Active SOS</span>
            <span className="font-bold text-amber-300 transition-all duration-300">
              {activeSosCount} {criticalCount > 0 && <span className="text-red-400 font-extrabold animate-pulse">({criticalCount} Critical)</span>}
            </span>
          </div>
        </div>

        {/* Dispatched Units */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
          <Navigation className="w-4 h-4 text-sky-400" />
          <div>
            <span className="text-xs text-slate-400 block">Dispatched Units</span>
            <span className="font-bold text-sky-300 transition-all duration-300">{dispatchedUnitsCount} Units</span>
          </div>
        </div>

        {/* Avg Route ETA */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
          <Clock className="w-4 h-4 text-purple-400" />
          <div>
            <span className="text-xs text-slate-400 block">Avg Dispatch ETA</span>
            <span className="font-bold text-purple-300 transition-all duration-300">{avgEtaMinutes.toFixed(1)} mins</span>
          </div>
        </div>
      </div>

      {/* Actions: Export AAR Report, Sound Toggle, Connection Badge */}
      <div className="flex items-center gap-3">
        {/* Export AAR Button */}
        {onOpenAARModal && (
          <button
            onClick={onOpenAARModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:border-sky-500/50 text-xs font-semibold transition-all shadow-sm"
          >
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Export AAR</span>
          </button>
        )}

        {/* Audio Siren Mute/Unmute Toggle Button */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Emergency Siren Alerts' : 'Mute Emergency Siren Alerts'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            isMuted
              ? 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              : 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30 animate-pulse'
          }`}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-4 h-4 text-slate-400" />
              <span>Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 text-red-400" />
              <span>Sound ON</span>
            </>
          )}
        </button>

        {isReplayMode ? (
          <span className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            REPLAY MODE
          </span>
        ) : (
          <span className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${
            isConnected
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-red-500/20 text-red-300 border-red-500/40'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`} />
            {isConnected ? 'LIVE WEBSOCKET' : 'CONNECTING...'}
          </span>
        )}
      </div>
    </header>
  );
};
