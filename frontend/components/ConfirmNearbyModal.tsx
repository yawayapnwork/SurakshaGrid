'use client';

import React, { useState } from 'react';
import { CheckCircle2, ShieldAlert, ThumbsUp } from 'lucide-react';
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
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
        <ShieldAlert className="w-4 h-4 text-slate-400" />
        <h3 className="font-semibold text-xs text-slate-900 tracking-tight">
          Confirm Nearby Citizen Reports
        </h3>
      </div>

      <p className="text-[11px] text-slate-500">
        Verify nearby reported flood incidents to increase community trust scores and prioritize rescue dispatch.
      </p>

      <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar">
        {reports.map((report) => {
          const isConfirmed = confirmedIds.has(report.id);
          const isLoading = confirmingId === report.id;

          return (
            <div
              key={report.id}
              className="bg-slate-50/70 border border-slate-200/70 p-3 rounded-xl flex items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold px-2 py-0.5 rounded-md text-[10px] border ${
                    report.severity === 'CRITICAL_TRAPPED'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {report.severity}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {report.id.slice(0, 8)}
                  </span>
                </div>
                {report.voice_transcript && (
                  <p className="text-[11px] text-slate-600 truncate">
                    &quot;{report.voice_transcript}&quot;
                  </p>
                )}
                <div className="text-[10px] text-slate-500">
                  Trust Score: <span className="font-semibold text-slate-700">{report.trust_score}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleConfirm(report.id)}
                disabled={isConfirmed || isLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  isConfirmed
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                } disabled:opacity-75`}
              >
                {isConfirmed ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
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
