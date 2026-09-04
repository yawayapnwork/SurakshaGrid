'use client';

import React, { useEffect, useState } from 'react';
import { History, Pause, Play, RotateCcw } from 'lucide-react';
import { EventLog } from '@/types';

interface ReplayScrubberProps {
  events: EventLog[];
  isReplayMode: boolean;
  onToggleReplayMode: (active: boolean) => void;
  onSelectEventIndex: (idx: number) => void;
}

export const ReplayScrubber: React.FC<ReplayScrubberProps> = ({
  events,
  isReplayMode,
  onToggleReplayMode,
  onSelectEventIndex,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (events.length > 0) {
      setCurrentIndex(events.length - 1);
    }
  }, [events]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && isReplayMode && events.length > 0) {
      timer = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= events.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          onSelectEventIndex(next);
          return next;
        });
      }, 1200);
    }
    return () => clearInterval(timer);
  }, [isPlaying, isReplayMode, events, onSelectEventIndex]);

  const handleSliderChange = (idx: number) => {
    setCurrentIndex(idx);
    onSelectEventIndex(idx);
  };

  const currentEvent = events[currentIndex];

  if (!isReplayMode) {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={() => onToggleReplayMode(true)}
          className="py-2.5 px-5 rounded-full bg-white/95 hover:bg-slate-50 border border-slate-200/80 hover:border-indigo-300 text-indigo-700 font-semibold text-xs shadow-sm flex items-center gap-2 transition-all backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-1"
        >
          <History className="w-4 h-4 text-indigo-600" />
          Enter Digital Twin Replay Mode
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-2xl bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm text-slate-900 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-xs text-slate-900 tracking-tight">
            Incident Digital Twin Replay
          </span>
        </div>

        {currentEvent && (
          <span className="text-xs font-mono text-slate-500 bg-slate-50 px-3 py-1 rounded-md border border-slate-200/80">
            {new Date(currentEvent.occurred_at).toLocaleString()}
          </span>
        )}

        <button
          onClick={() => {
            setIsPlaying(false);
            onToggleReplayMode(false);
          }}
          className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 transition-colors"
        >
          Return to Live Mode
        </button>
      </div>

      {/* Controls & Scrubber */}
      <div className="flex items-center gap-4">
        {/* Play/Pause Button */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={events.length === 0}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-sm disabled:opacity-50"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
        </button>

        {/* Reset Button */}
        <button
          onClick={() => {
            setCurrentIndex(0);
            onSelectEventIndex(0);
          }}
          disabled={events.length === 0}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Slider */}
        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, events.length - 1)}
            value={currentIndex}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-colors"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>Event 0</span>
            <span>Current: {currentIndex + 1} / {events.length}</span>
            <span>Latest Event</span>
          </div>
        </div>
      </div>

      {/* Event Details Badge */}
      {currentEvent && (
        <div className="text-[11px] font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80 flex items-center justify-between text-slate-600">
          <span className="font-semibold text-indigo-600">Event: {currentEvent.event_type}</span>
          <span className="truncate max-w-md text-slate-400">
            Payload: {JSON.stringify(currentEvent.payload)}
          </span>
        </div>
      )}
    </div>
  );
};
