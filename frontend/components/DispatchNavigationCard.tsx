'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Navigation2,
  Phone,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react';
import { DispatchAssignment, DispatchRoute, SOSReport } from '@/types';
import { RouteProgress } from '@/hooks/useAnimatedRouteProgress';

interface DispatchNavigationCardProps {
  assignment: DispatchAssignment;
  sosReport?: SOSReport;
  route: DispatchRoute | null;
  routeError: string | null;
  isLoadingRoute: boolean;
  progress: RouteProgress;
  onClose: () => void;
  onMarkArrived: () => void;
  onUpdateStatus: () => void;
  onCallDispatcher: () => void;
  isMarkingArrived: boolean;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return '<1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

/**
 * Blinkit/Uber-style floating navigation card for a focused dispatch assignment: big ETA,
 * remaining distance, the current turn instruction, and quick actions. Slides up on mount
 * via a CSS transform transition (no separate keyframe animation needed).
 */
export const DispatchNavigationCard: React.FC<DispatchNavigationCardProps> = ({
  assignment,
  sosReport,
  route,
  routeError,
  isLoadingRoute,
  progress,
  onClose,
  onMarkArrived,
  onUpdateStatus,
  onCallDispatcher,
  isMarkingArrived,
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const currentStep = route?.steps[progress.currentStepIndex] ?? null;
  const nextStep = route?.steps[progress.currentStepIndex + 1] ?? null;

  const etaSeconds = route ? progress.remainingSeconds : assignment.eta_seconds;
  const distanceMeters = route ? progress.remainingMeters : null;

  return (
    <div
      className={`fixed bottom-0 inset-x-0 sm:bottom-5 sm:left-1/2 sm:inset-x-auto sm:-translate-x-1/2 sm:w-[420px] z-40 px-3 pb-3 sm:px-0 sm:pb-0 transition-transform duration-300 ease-out ${
        mounted ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-white border border-slate-200/80 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden">
        {/* Header: unit + close */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Navigation2 className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">{assignment.unit_name}</div>
              <div className="text-[10.5px] text-slate-400 truncate">
                En route to incident #{assignment.sos_id.slice(0, 8)}
                {sosReport ? ` — ${sosReport.severity.replace('_', ' ')}` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Big ETA + distance row */}
        <div className="flex items-end justify-between px-4 pt-3.5 pb-2">
          <div>
            <div className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
              {formatEta(etaSeconds)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Estimated time of arrival</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-slate-700 tabular-nums leading-none">
              {distanceMeters !== null ? formatDistance(distanceMeters) : '—'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Remaining</div>
          </div>
        </div>

        {/* Turn-by-turn instruction */}
        <div className="mx-4 mb-3 bg-slate-900 text-white rounded-xl p-3 flex items-center gap-3">
          {isLoadingRoute ? (
            <>
              <Loader2 className="w-5 h-5 shrink-0 animate-spin text-slate-300" />
              <span className="text-xs font-medium text-slate-300">Fetching live route…</span>
            </>
          ) : currentStep ? (
            <>
              <Navigation2 className="w-5 h-5 shrink-0 text-blue-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{currentStep.instruction}</div>
                {nextStep && (
                  <div className="text-[10.5px] text-slate-400 truncate mt-0.5">
                    Then: {nextStep.instruction}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
              <span className="text-xs font-medium text-slate-300">
                {routeError || 'Route unavailable — showing a direct line.'}
              </span>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <button
            onClick={onUpdateStatus}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Update Status</span>
          </button>
          <button
            onClick={onCallDispatcher}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors"
          >
            <Phone className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Call Dispatcher</span>
          </button>
          <button
            onClick={onMarkArrived}
            disabled={isMarkingArrived}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
          >
            {isMarkingArrived ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span className="text-[10px] font-semibold">Mark as Arrived</span>
          </button>
        </div>

        {/* Trust/severity footer strip */}
        {sosReport && (
          <div className="flex items-center gap-1.5 px-4 pb-3 text-[10.5px] text-slate-400">
            <Shield className="w-3 h-3" />
            Trust score {sosReport.trust_score} · Reported {new Date(sosReport.created_at).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};
