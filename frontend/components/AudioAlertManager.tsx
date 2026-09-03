'use client';

/**
 * Plays a high-visibility emergency siren alarm pulse using HTML5 Web Audio API
 * (synthetic dual-frequency siren alert pulse).
 *
 * @param isMuted If true, bypasses audio playback
 */
export function playTwoToneEmergencyAlert(isMuted = false) {
  if (isMuted) return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

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
  } catch (err) {
    console.warn('AudioContext playback prevented by browser policy:', err);
  }
}
