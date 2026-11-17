// Synthesised sound: every effect is built from oscillators and filtered noise in
// WebAudio, so the game ships no audio files and makes no network request. The context
// is created lazily on the first user gesture (browsers block audio before one); in
// screenshot mode there is no gesture, so every call is a guarded no-op.
let ctx = null;
let master = null;
let muted = false;
let noiseBuffer = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    const length = ctx.sampleRate;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.42;
}

export function isMuted() {
  return muted;
}

function noise({ duration, frequency, type = 'lowpass', gain = 0.5, at = 0, sweepTo = null }) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + at;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, t);
  if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
  source.connect(filter).connect(amp).connect(master);
  source.start(t, Math.random() * 0.5);
  source.stop(t + duration + 0.05);
}

function tone({ frequency, duration, type = 'sine', gain = 0.3, at = 0, slideTo = null }) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(amp).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

// distance in metres softens and dulls a shot; 0 is the player's own weapon.
export function playShot(kind, distance = 0) {
  const near = Math.max(0, 1 - distance / 55);
  const gain = 0.28 + 0.5 * near;
  if (kind === 'pistol') {
    noise({ duration: 0.11, frequency: 2600, sweepTo: 300, gain });
    tone({ frequency: 190, duration: 0.07, type: 'square', gain: 0.16 * near });
  } else if (kind === 'dmr') {
    noise({ duration: 0.22, frequency: 1800, sweepTo: 180, gain: gain * 1.15 });
    tone({ frequency: 120, duration: 0.16, type: 'sawtooth', gain: 0.22 * near, slideTo: 55 });
  } else if (kind === 'shotgun') {
    noise({ duration: 0.3, frequency: 1400, sweepTo: 140, gain: gain * 1.2 });
    tone({ frequency: 95, duration: 0.2, type: 'sawtooth', gain: 0.26 * near, slideTo: 45 });
  } else {
    noise({ duration: 0.13, frequency: 3200, sweepTo: 420, gain });
    tone({ frequency: 150, duration: 0.08, type: 'square', gain: 0.14 * near, slideTo: 70 });
  }
}

export function playDryClick() {
  tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.12 });
}

export function playReload() {
  tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.14 });
  tone({ frequency: 620, duration: 0.04, type: 'square', gain: 0.14, at: 0.35 });
  tone({ frequency: 1100, duration: 0.05, type: 'square', gain: 0.18, at: 0.8 });
}

export function playHit(kill) {
  tone({ frequency: kill ? 1320 : 990, duration: 0.07, type: 'sine', gain: 0.25 });
  if (kill) tone({ frequency: 1760, duration: 0.1, type: 'sine', gain: 0.2, at: 0.07 });
}

export function playHurt() {
  tone({ frequency: 110, duration: 0.18, type: 'sawtooth', gain: 0.3, slideTo: 60 });
  noise({ duration: 0.12, frequency: 500, gain: 0.2 });
}

export function playPlantBeep(final = false) {
  tone({ frequency: final ? 1560 : 880, duration: final ? 0.3 : 0.09, type: 'sine', gain: 0.22 });
}

export function playExplosion() {
  noise({ duration: 1.4, frequency: 900, sweepTo: 60, gain: 0.9 });
  tone({ frequency: 70, duration: 1.1, type: 'sine', gain: 0.55, slideTo: 28 });
  noise({ duration: 0.5, frequency: 4000, type: 'highpass', gain: 0.25 });
}

export function playRoundEnd(won) {
  const notes = won ? [523, 659, 784] : [392, 330, 262];
  notes.forEach((frequency, i) => tone({ frequency, duration: 0.22, type: 'triangle', gain: 0.22, at: i * 0.16 }));
}

export function playBuy() {
  tone({ frequency: 740, duration: 0.06, type: 'sine', gain: 0.18 });
  tone({ frequency: 988, duration: 0.09, type: 'sine', gain: 0.18, at: 0.06 });
}

export function playStep(run) {
  noise({ duration: 0.06, frequency: 700, gain: run ? 0.07 : 0.045 });
}

export function playGrenadePin() {
  tone({ frequency: 1800, duration: 0.03, type: 'square', gain: 0.1 });
}
