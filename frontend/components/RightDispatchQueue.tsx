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
    // Mobile: stacks below the map as a normal-flow block (full width, capped height,
    // internal scroll). Desktop (lg+): the original floating card pinned top-right.
    <aside className="relative w-full max-h-[70vh] lg:absolute lg:right-6 lg:top-6 lg:z-20 lg:w-[22rem] lg:max-h-[calc(100%-3rem)] bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm text-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4">
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
      <div className="overflow-y-auto space-y-2.5 pr-1 flex-1 custom-scrollbar">
        {assignments.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
            <UserCheck className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-500">No active dispatches</p>
            <p className="text-[10.5px] text-slate-400 mt-1">
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
                className="bg-white hover:bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 p-3.5 rounded-xl transition-all duration-150 cursor-pointer space-y-2 group hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-slate-400" /> {item.unit_name}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> ETA {etaMins}m
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Incident: {item.sos_id.slice(0, 8)}…</span>
                  <span className="text-slate-700 font-semibold">Cost {item.cost.toFixed(2)}</span>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-100">
                  <span>{new Date(item.assigned_at).toLocaleTimeString()}</span>
                  <span className="text-slate-500 group-hover:text-slate-900 group-hover:underline">Route Preview &rarr;</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
