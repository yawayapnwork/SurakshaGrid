'use client';

import React from 'react';
import { CloudRain, Play, RotateCcw, Zap } from 'lucide-react';

interface LeftControllerProps {
  rainfall: number;
  onRainfallChange: (val: number) => void;
  onTriggerFloodScenario: () => void;
  onResetScenario: () => void;
  onRunDispatch: () => void;
  isDispatching: boolean;
  isTriggering: boolean;
  isResetting: boolean;
}

export const LeftController: React.FC<LeftControllerProps> = ({
  rainfall,
  onRainfallChange,
  onTriggerFloodScenario,
  onResetScenario,
  onRunDispatch,
  isDispatching,
  isTriggering,
  isResetting,
}) => {
  return (
    <aside className="fixed left-6 top-20 z-20 w-80 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Zap className="w-5 h-5 text-amber-400" />
        <h2 className="font-bold text-sm text-white tracking-wide uppercase">
          Scenario Controls
        </h2>
      </div>

      {/* 1. What-If Rainfall Slider */}
      <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <CloudRain className="w-4 h-4 text-sky-400" /> What-If Rainfall Intensity
          </label>
          <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
            {rainfall}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={rainfall}
          onChange={(e) => onRainfallChange(Number(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-sky-400 transition-colors"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>0% (Dry)</span>
          <span>50% (Moderate)</span>
          <span>100% (Extreme)</span>
        </div>
      </div>

      {/* 2. Trigger Flood Event & Reset Scenario Actions */}
      <div className="space-y-2">
        <button
          onClick={onTriggerFloodScenario}
          disabled={isTriggering || isResetting}
          className="w-full py-2.5 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Zap className={`w-4 h-4 text-amber-400 ${isTriggering ? 'animate-spin' : ''}`} />
          {isTriggering ? 'Seeding Hackathon Demo...' : 'Trigger Flood Event Scenario'}
        </button>

        <button
          onClick={onResetScenario}
          disabled={isTriggering || isResetting}
          className="w-full py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          {isResetting ? 'Wiping Demo State...' : 'Reset Scenario State'}
        </button>
      </div>

      {/* 3. Run Rescue Dispatch */}
      <button
        onClick={onRunDispatch}
        disabled={isDispatching}
        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Play className={`w-4 h-4 fill-current ${isDispatching ? 'animate-bounce' : ''}`} />
        {isDispatching ? 'Running Hungarian Matcher...' : 'Run Rescue Dispatch'}
      </button>
    </aside>
  );
};
