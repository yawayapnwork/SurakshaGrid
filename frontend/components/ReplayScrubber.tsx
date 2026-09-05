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

  // Jump the scrubber to the latest event whenever a new `events` array arrives.
  // Adjusted directly during render (React's recommended pattern for deriving
  // state from a prop change) rather than in an effect, since this is a pure
  // response to a prop change, not a sync with an external system.
  const [prevEvents, setPrevEvents] = useState(events);
  if (events !== prevEvents) {
    setPrevEvents(events);
    if (events.length > 0) {
      setCurrentIndex(events.length - 1);
    }
  }

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
      // Mobile: sits in normal flow below the map/queue stack. Desktop: floats
      // bottom-center over the map as before.
      <div className="relative w-full flex justify-center py-2 lg:py-0 lg:absolute lg:bottom-6 lg:left-1/2 lg:-translate-x-1/2 lg:z-20">
        <button
          onClick={() => onToggleReplayMode(true)}
          className="min-h-[44px] py-2.5 px-5 rounded-xl bg-white/95 hover:bg-slate-50 border border-slate-200/80 text-slate-700 font-semibold text-xs shadow-sm flex items-center gap-2 transition-all backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-1"
        >
          <History className="w-4 h-4 text-slate-400" />
          Enter Replay Mode
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-2xl mx-auto lg:absolute lg:bottom-6 lg:left-1/2 lg:-translate-x-1/2 lg:z-20 lg:w-[calc(100%-2rem)] bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 shadow-sm text-slate-900 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-xs text-slate-900 tracking-tight">
            Incident Replay
          </span>
        </div>

        {currentEvent && (
          <span className="hidden sm:inline text-xs font-mono text-slate-500 bg-slate-50 px-3 py-1 rounded-md border border-slate-200/80">
            {new Date(currentEvent.occurred_at).toLocaleString()}
          </span>
        )}

        <button
          onClick={() => {
            setIsPlaying(false);
            onToggleReplayMode(false);
          }}
          className="min-h-[36px] text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <span className="hidden sm:inline">Return to Live Mode</span>
          <span className="sm:hidden">Exit Replay</span>
        </button>
      </div>

      {/* Controls & Scrubber */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Play/Pause Button */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={events.length === 0}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-all shadow-sm disabled:opacity-50"
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
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Slider */}
        <div className="flex-1 min-w-0 space-y-1 py-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(0, events.length - 1)}
            value={currentIndex}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-slate-900 transition-colors"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span className="hidden sm:inline">Event 0</span>
            <span>Current: {currentIndex + 1} / {events.length}</span>
            <span className="hidden sm:inline">Latest Event</span>
          </div>
        </div>
      </div>

      {/* Event Details Badge */}
      {currentEvent && (
        <div className="text-[11px] font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2 text-slate-600">
          <span className="font-semibold text-slate-700 shrink-0">Event: {currentEvent.event_type}</span>
          <span className="truncate text-slate-400">
            Payload: {JSON.stringify(currentEvent.payload)}
          </span>
        </div>
      )}
    </div>
  );
};
