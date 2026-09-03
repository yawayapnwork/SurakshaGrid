'use client';

import { useCallback, useEffect, useState } from 'react';

// Global state tracking whether the user has interacted with the document
let hasUserInteracted = false;

// Global Web Audio API AudioContext singleton instance
let globalAudioCtx: AudioContext | null = null;

/**
 * Safely unlocks and resumes the Web Audio API AudioContext on the first user interaction gesture.
 */
export function unlockAudioContext(): void {
  hasUserInteracted = true;
  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioContextClass) {
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      try {
        globalAudioCtx = new AudioContextClass();
      } catch (err) {
        console.warn('Failed to initialize AudioContext on user interaction:', err);
      }
    }
    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch((err) => {
        console.warn('Failed to resume AudioContext on user interaction:', err);
      });
    }
  }
}

if (typeof window !== 'undefined') {
  const registerUserInteraction = () => {
    unlockAudioContext();

    window.removeEventListener('pointerdown', registerUserInteraction);
    window.removeEventListener('keydown', registerUserInteraction);
    window.removeEventListener('click', registerUserInteraction);
    window.removeEventListener('touchstart', registerUserInteraction);
  };

  window.addEventListener('pointerdown', registerUserInteraction, { passive: true });
  window.addEventListener('keydown', registerUserInteraction, { passive: true });
  window.addEventListener('click', registerUserInteraction, { passive: true });
  window.addEventListener('touchstart', registerUserInteraction, { passive: true });
}

export function getHasUserInteracted(): boolean {
  return hasUserInteracted;
}

/**
 * Fallback static audio player for browsers enforcing strict autoplay policies
 * or blocking dynamic AudioContext synthesis.
 *
 * @param isMuted If true, bypasses audio playback
 */
export function playFallbackAudio(isMuted = false): boolean {
  if (isMuted) return false;
  if (typeof window === 'undefined') return false;

  try {
    const audio = new Audio('/alert.mp3');
    audio.volume = 0.6;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('HTML5 Audio alert fallback prevented by browser autoplay policy:', err);
      });
    }
    return true;
  } catch (err) {
    console.warn('Failed to play fallback static audio alert (/alert.mp3):', err);
    return false;
  }
}

/**
 * Plays a high-visibility emergency siren alarm pulse using HTML5 Web Audio API
 * (synthetic dual-frequency siren alert pulse).
 *
 * Catches NotAllowedError or uninitialized AudioContext states and gracefully
 * falls back to static HTML5 Audio (/alert.mp3).
 *
 * Safely guarded by navigation bar mute toggle state and user interaction flags.
 *
 * @param isMuted Navigation bar mute toggle state (if true, audio playback is bypassed)
 */
export function playTwoToneEmergencyAlert(isMuted = false): void {
  // Navigation bar mute toggle state guard
  if (isMuted) return;

  // SSR guard
  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

  if (!AudioContextClass) {
    playFallbackAudio(isMuted);
    return;
  }

  try {
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      globalAudioCtx = new AudioContextClass();
    }

    const ctx = globalAudioCtx;

    // Check AudioContext state and attempt resume if suspended
    if (ctx.state === 'suspended') {
      if (!hasUserInteracted) {
        console.warn('AudioContext is suspended prior to user gesture. Falling back to static HTML5 Audio alert.');
        playFallbackAudio(isMuted);
        return;
      }
      ctx.resume().catch((resumeErr) => {
        console.warn('AudioContext resume failed, using static audio fallback:', resumeErr);
        playFallbackAudio(isMuted);
      });
    }

    if (ctx.state === 'suspended') {
      // Still suspended after attempt, fallback to static audio
      playFallbackAudio(isMuted);
      return;
    }

    // Tone 1: 880Hz (A5 emergency siren high tone)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.35, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.25);

    // Tone 2: 1174.66Hz (D6 higher urgency siren pulse)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.2);
    gain2.gain.setValueAtTime(0.45, ctx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.65);
  } catch (err: any) {
    if (err?.name === 'NotAllowedError' || err?.name === 'InvalidStateError') {
      console.warn('Web Audio API blocked by browser autoplay policy, falling back to static audio (/alert.mp3):', err);
      playFallbackAudio(isMuted);
    } else {
      console.warn('AudioContext playback error, attempting static audio fallback:', err);
      playFallbackAudio(isMuted);
    }
  }
}

/**
 * Custom React Hook for triggering emergency audio alerts with mute state and user interaction awareness.
 *
 * @param initialMuted Initial navigation bar mute toggle state
 */
export function useAudioAlert(initialMuted = false) {
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [userInteracted, setUserInteracted] = useState(hasUserInteracted);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleInteraction = () => {
      setUserInteracted(true);
    };

    if (!userInteracted) {
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('click', handleInteraction);
      window.addEventListener('pointerdown', handleInteraction, { once: true });
      window.addEventListener('keydown', handleInteraction, { once: true });
      window.addEventListener('click', handleInteraction, { once: true });
    }

    return () => {
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('click', handleInteraction);
    };
  }, [userInteracted]);

  const triggerAlert = useCallback(() => {
    playTwoToneEmergencyAlert(isMuted);
  }, [isMuted]);

  return {
    playAlert: triggerAlert,
    isMuted,
    setIsMuted,
    hasUserInteracted: userInteracted,
    playFallbackAlert: () => playFallbackAudio(isMuted),
  };
}


