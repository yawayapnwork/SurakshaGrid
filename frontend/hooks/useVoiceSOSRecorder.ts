'use client';

import { useCallback, useRef, useState } from 'react';
import { transcribeVoiceSOS } from '@/services/api';

// Preference order: browsers only support a subset of these, MediaRecorder.isTypeSupported
// picks the first usable one. The backend decodes with ffmpeg so any of them works.
const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export interface UseVoiceSOSRecorderResult {
  isRecording: boolean;
  isTranscribing: boolean;
  errorMessage: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

/**
 * Captures a citizen's spoken SOS description via the mic and sends it to the backend
 * Whisper endpoint for transcription + translation into English.
 *
 * @param onTranscript called with the English transcript once the backend responds.
 */
export function useVoiceSOSRecorder(onTranscript: (text: string) => void): UseVoiceSOSRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMessage('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setErrorMessage('Recording failed unexpectedly. Please try again.');
        setIsRecording(false);
        stopTracks();
      };

      recorder.onstop = async () => {
        stopTracks();
        setIsRecording(false);

        const audioBlob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];

        if (audioBlob.size === 0) {
          setErrorMessage('No audio was captured. Please try again.');
          return;
        }

        setIsTranscribing(true);
        try {
          const result = await transcribeVoiceSOS(audioBlob);
          if (result.text) {
            onTranscript(result.text);
          } else {
            setErrorMessage('Could not detect any speech in the recording.');
          }
        } catch (err) {
          console.error('Voice transcription failed:', err);
          setErrorMessage(err instanceof Error ? err.message : 'Failed to transcribe voice recording.');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access failed:', err);
      setErrorMessage('Microphone access denied. Please grant permission in browser settings.');
      setIsRecording(false);
    }
  }, [stopTracks, onTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { isRecording, isTranscribing, errorMessage, startRecording, stopRecording };
}
