/**
 * Web Audio API Sound Chime Utility
 * Menghasilkan suara bel restoran & chime transaksi yang bersih dan responsif tanpa tergantung file eksternal.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Membunyikan bel restoran (Kitchen Service Desk Bell / Order Ready Bell)
 * Suara "Ting-Ting!" khas bel meja saji restoran yang jernih dan nyaring.
 */
export function playKitchenBellSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const playStrike = (timeOffset: number, baseFreq: number, volume: number) => {
      const now = ctx.currentTime + timeOffset;

      // Primary metallic sine tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(baseFreq, now);
      gain1.gain.setValueAtTime(volume, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 1.2);

      // Overtone harmonic for crisp brass chime sparkle
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(baseFreq * 2.76, now);
      gain2.gain.setValueAtTime(volume * 0.35, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.5);
    };

    // Strike 1 (Ting!)
    playStrike(0, 1850, 0.6);
    // Strike 2 (Ting!) 160ms later for clear kitchen bell alert
    playStrike(0.16, 2093, 0.7);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

/**
 * Membunyikan chime transaksi sukses POS (Success Payment Chime) C5 -> G5
 */
export function playPosChimeSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

/**
 * Membunyikan chime pesanan siap (Order Ready Chime 3-Tone C5 -> E5 -> G5)
 */
export function playOrderReadyChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.4, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.6);
    });
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}
