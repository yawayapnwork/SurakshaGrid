'use client';

import React from 'react';
import { Clock, Navigation, Shield, UserCheck } from 'lucide-react';
import { DispatchAssignment } from '@/types';

interface RightDispatchQueueProps {
  assignments: DispatchAssignment[];
  onSelectAssignment?: (assignment: DispatchAssignment) => void;
}

export const RightDispatchQueue: React.FC<RightDispatchQueueProps> = ({
  assignments,
  onSelectAssignment,
}) => {
  return (
    <aside className="flex flex-col flex-1 min-h-0 w-full h-full bg-white border border-slate-200 rounded-xl shadow-sm p-4 overflow-hidden text-slate-900">
      {/* Header */}
      <div className="shrink-0 flex-shrink-0 flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
            <Navigation className="w-3.5 h-3.5 text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-[13px] text-slate-900 tracking-tight">Live Dispatch Queue</h2>
            <p className="text-[11px] text-slate-400">Optimizer-assigned rescue units</p>
          </div>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-900 text-white tabular-nums">
          {assignments.length}
        </span>
      </div>

      {/* Dispatch Cards List */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
        {assignments.length === 0 ? (
          <div className="text-center py-12 px-4 bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
            <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-500">No active dispatches</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Click &quot;Run Rescue Dispatch&quot; to solve optimal unit assignments.
            </p>
          </div>
        ) : (
          assignments.map((item, idx) => {
            const etaMins = (item.eta_seconds / 60).toFixed(1);
            return (
              <div
                key={`${item.sos_id}-${item.rescue_unit_id}-${idx}`}
                onClick={() => onSelectAssignment?.(item)}
                className="bg-white hover:bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 p-4 rounded-xl transition-all duration-150 cursor-pointer space-y-2.5 group hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-slate-400" /> {item.unit_name}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" /> ETA {etaMins}m
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                  <span>Incident: {item.sos_id.slice(0, 8)}…</span>
                  <span className="text-slate-800 font-bold">Cost {item.cost.toFixed(2)}</span>
                </div>

                <div className="text-[10.5px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span>{new Date(item.assigned_at).toLocaleTimeString()}</span>
                  <span className="text-slate-600 font-semibold group-hover:text-slate-900 group-hover:underline">Route Preview &rarr;</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
