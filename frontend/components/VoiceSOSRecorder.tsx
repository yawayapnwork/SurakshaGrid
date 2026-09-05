'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Mic, Square } from 'lucide-react';
import { useVoiceSOSRecorder } from '@/hooks/useVoiceSOSRecorder';

interface VoiceSOSRecorderProps {
  /** Called every time a new server-transcribed line is appended. */
  onTranscript?: (text: string) => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Records a citizen's spoken SOS description and sends it to the backend Whisper
 * endpoint (POST /api/transcribe-audio) for multilingual transcription + translation
 * into English, unlike VoiceToTextInput which relies on the browser's built-in
 * (Chrome/Edge-only, English-biased) Web Speech API.
 */
export const VoiceSOSRecorder: React.FC<VoiceSOSRecorderProps> = ({ onTranscript }) => {
  const [transcript, setTranscript] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleTranscript = (text: string) => {
    setTranscript((prev) => (prev ? `${prev} ${text}` : text));
    onTranscript?.(text);
  };

  const { isRecording, isTranscribing, errorMessage, startRecording, stopRecording } =
    useVoiceSOSRecorder(handleTranscript);

  useEffect(() => {
    if (isRecording) {
      setElapsedSeconds(0);
      intervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRecording]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700">Voice SOS (server transcription)</label>
        {isRecording && (
          <span className="text-[11px] font-mono font-semibold text-red-600">{formatElapsed(elapsedSeconds)}</span>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          className={`shrink-0 p-3 rounded-full transition-all disabled:opacity-50 ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isTranscribing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isRecording ? (
            <Square className="w-4 h-4" fill="currentColor" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          {isRecording ? (
            // Waveform mock: animated bars, not a real amplitude analysis.
            <div className="flex items-center gap-0.5 h-6">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className="w-0.5 bg-red-400 rounded-full animate-pulse"
                  style={{
                    height: `${30 + ((i * 37) % 70)}%`,
                    animationDelay: `${i * 60}ms`,
                    animationDuration: '900ms',
                  }}
                />
              ))}
            </div>
          ) : isTranscribing ? (
            <span className="text-xs text-slate-500">Transcribing with Whisper…</span>
          ) : (
            <span className="text-xs text-slate-400">Tap the mic and describe your situation.</span>
          )}
        </div>
      </div>

      {transcript && (
        <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3 text-xs text-slate-700 whitespace-pre-wrap">
          {transcript}
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
