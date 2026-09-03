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
    <aside className="fixed right-6 top-20 z-20 w-84 max-h-[calc(100vh-7rem)] bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-sky-400" />
          <h2 className="font-bold text-sm text-white tracking-wide uppercase">
            Live Dispatch Queue
          </h2>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
          {assignments.length} Active
        </span>
      </div>

      {/* Dispatch Cards List */}
      <div className="overflow-y-auto space-y-3 pr-1 flex-1 custom-scrollbar">
        {assignments.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
            <UserCheck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-400">No active dispatches</p>
            <p className="text-[10px] text-slate-500 mt-1">
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
                className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/40 p-3.5 rounded-xl transition-all cursor-pointer space-y-2 group shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-sky-400" /> {item.unit_name}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> ETA {etaMins}m
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Incident ID: {item.sos_id.slice(0, 8)}...</span>
                  <span className="text-emerald-400 font-semibold">Cost: {item.cost.toFixed(2)}</span>
                </div>

                <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span>Assigned At: {new Date(item.assigned_at).toLocaleTimeString()}</span>
                  <span className="text-sky-400 group-hover:underline">Route Preview &rarr;</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
