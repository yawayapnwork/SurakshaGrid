'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert, ThumbsUp } from 'lucide-react';
import { SOSReport } from '@/types';

interface ConfirmNearbyModalProps {
  reports: SOSReport[];
  onConfirmReport: (sosId: string) => Promise<void>;
}

export const ConfirmNearbyModal: React.FC<ConfirmNearbyModalProps> = ({
  reports,
  onConfirmReport,
}) => {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

  const handleConfirm = async (id: string) => {
    setConfirmingId(id);
    try {
      await onConfirmReport(id);
      setConfirmedIds((prev) => new Set(prev).add(id));
    } catch (err) {
      console.error('Failed to confirm report:', err);
    } finally {
      setConfirmingId(null);
    }
  };

  if (reports.length === 0) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-400" />
        <h3 className="font-bold text-xs text-white uppercase tracking-wider">
          Confirm Nearby Citizen Reports
        </h3>
      </div>

      <p className="text-[11px] text-slate-400">
        Verify nearby reported flood incidents to increase community trust scores and prioritize rescue dispatch.
      </p>

      <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar">
        {reports.map((report) => {
          const isConfirmed = confirmedIds.has(report.id);
          const isLoading = confirmingId === report.id;

          return (
            <div
              key={report.id}
              className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                    report.severity === 'CRITICAL_TRAPPED'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {report.severity}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    ID: {report.id.slice(0, 8)}
                  </span>
                </div>
                {report.voice_transcript && (
                  <p className="text-[11px] text-slate-300 truncate">
                    &quot;{report.voice_transcript}&quot;
                  </p>
                )}
                <div className="text-[10px] text-slate-400 font-mono">
                  Trust Score: <span className="font-bold text-sky-400">{report.trust_score}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleConfirm(report.id)}
                disabled={isConfirmed || isLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  isConfirmed
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow'
                } disabled:opacity-75`}
              >
                {isConfirmed ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Verified
                  </>
                ) : (
                  <>
                    <ThumbsUp className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Confirm
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
