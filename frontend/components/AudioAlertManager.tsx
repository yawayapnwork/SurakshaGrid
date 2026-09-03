'use client';

let hasUserInteracted = false;

if (typeof window !== 'undefined') {
  const registerUserInteraction = () => {
    hasUserInteracted = true;
    window.removeEventListener('pointerdown', registerUserInteraction);
    window.removeEventListener('keydown', registerUserInteraction);
    window.removeEventListener('click', registerUserInteraction);
  };

  window.addEventListener('pointerdown', registerUserInteraction, { passive: true });
  window.addEventListener('keydown', registerUserInteraction, { passive: true });
  window.addEventListener('click', registerUserInteraction, { passive: true });
}

function playFallbackAudio() {
  try {
    const audio = new Audio('/alert.mp3');
    audio.volume = 0.5;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('HTML5 Audio alert fallback prevented by browser autoplay policy:', err);
      });
    }
  } catch (err) {
    console.warn('Failed to play fallback static audio alert:', err);
  }
}

/**
 * Plays a high-visibility emergency siren alarm pulse using HTML5 Web Audio API
 * (synthetic dual-frequency siren alert pulse). Falls back gracefully to static
 * HTML5 Audio (/alert.mp3) if Web Audio API is blocked or uninitialized.
 *
 * @param isMuted If true, bypasses audio playback
 */
export function playTwoToneEmergencyAlert(isMuted = false) {
  if (isMuted) return;

  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

  if (!AudioContextClass) {
    playFallbackAudio();
    return;
  }

  try {
    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Tone 1: 880Hz (A5 emergency tone)
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
      console.warn('Web Audio API blocked by autoplay policy, switching to static audio fallback...');
      playFallbackAudio();
    } else {
      console.warn('AudioContext playback error, attempting static audio fallback:', err);
      playFallbackAudio();
    }
  }
}

