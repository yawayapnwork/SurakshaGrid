'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Globe, Mic, MicOff, Volume2 } from 'lucide-react';
import { VoiceSOSRecorder } from '@/components/VoiceSOSRecorder';

interface VoiceToTextInputProps {
  value: string;
  onChange: (val: string) => void;
}

// Minimal shape of the non-standard (vendor-prefixed) Web Speech API — not in lib.dom.d.ts.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}
interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
}

const SUPPORTED_LANGUAGES = [
  { code: 'hi-IN', label: 'Hindi (हिंदी)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
  { code: 'bn-IN', label: 'Bengali (বাংলা)' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)' },
];

export const VoiceToTextInput: React.FC<VoiceToTextInputProps> = ({ value, onChange }) => {
  const [selectedLang, setSelectedLang] = useState('hi-IN');
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const win = window as WindowWithSpeechRecognition;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reporting unsupported browser capability, no render-time alternative
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      if (currentTranscript) {
        const val = valueRef.current;
        onChangeRef.current(val ? `${val} ${currentTranscript}` : currentTranscript);
        setErrorMessage(null);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      console.warn('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setErrorMessage('Microphone access denied. Please grant permission in browser settings.');
      } else if (event.error === 'no-speech') {
        setErrorMessage('No speech detected. Tap microphone and speak clearly.');
      } else {
        setErrorMessage(`Voice input error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [selectedLang]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    setErrorMessage(null);

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.lang = selectedLang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        setErrorMessage('Microphone permission or browser speech error.');
        setIsListening(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Volume2 className="w-4 h-4 text-slate-400" /> Emergency Description (Voice or Text)
        </label>

        {/* Language Selector */}
        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value)}
            disabled={isListening}
            className="bg-transparent text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Textarea + Mic Button */}
      <div className="relative">
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe your situation or tap the microphone to speak in your language..."
          className="w-full bg-white border border-slate-200 focus:border-slate-400 rounded-xl p-3 pr-12 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all resize-none"
        />

        {isSupported && (
          <button
            type="button"
            onClick={toggleListening}
            title={isListening ? 'Stop Recording' : 'Start Voice Input'}
            className={`absolute right-3 top-3 p-2 rounded-lg transition-all ${
              isListening
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isListening && !errorMessage && (
        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Listening ({SUPPORTED_LANGUAGES.find((l) => l.code === selectedLang)?.label})... Speak clearly.
        </div>
      )}

      {/* Fallback for browsers without the Web Speech API (Firefox, Safari, etc.):
          server-side Whisper transcription instead of live in-browser recognition. */}
      {!isSupported && (
        <VoiceSOSRecorder
          onTranscript={(text) => onChange(value ? `${value} ${text}` : text)}
        />
      )}
    </div>
  );
};
