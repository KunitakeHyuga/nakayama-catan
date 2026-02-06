type ToneStep = {
  frequency: number;
  duration: number;
  delay?: number;
  type?: OscillatorType;
  gain?: number;
};

type SoundEffect =
  | "dice"
  | "resource"
  | "build"
  | "devCard"
  | "tradeSuccess"
  | "tradeFail"
  | "tradeStart"
  | "turnEnd"
  | "robber";

const SOUND_LIBRARY: Record<SoundEffect, ToneStep[]> = {
  dice: [
    { frequency: 220, duration: 0.07, gain: 0.25, type: "triangle" },
    { frequency: 320, duration: 0.06, delay: 0.05, gain: 0.2, type: "triangle" },
    { frequency: 180, duration: 0.08, delay: 0.1, gain: 0.25, type: "triangle" },
  ],
  resource: [
    { frequency: 420, duration: 0.15, gain: 0.18, type: "sine" },
    { frequency: 520, duration: 0.2, delay: 0.12, gain: 0.15, type: "sine" },
  ],
  build: [
    { frequency: 160, duration: 0.12, gain: 0.22, type: "sawtooth" },
    { frequency: 210, duration: 0.18, delay: 0.08, gain: 0.18, type: "square" },
  ],
  devCard: [
    { frequency: 360, duration: 0.1, gain: 0.2, type: "triangle" },
    { frequency: 520, duration: 0.14, delay: 0.06, gain: 0.18, type: "sine" },
    { frequency: 420, duration: 0.12, delay: 0.14, gain: 0.16, type: "triangle" },
  ],
  tradeSuccess: [
    { frequency: 500, duration: 0.12, gain: 0.2, type: "sine" },
    { frequency: 650, duration: 0.16, delay: 0.08, gain: 0.2, type: "sine" },
    { frequency: 800, duration: 0.18, delay: 0.16, gain: 0.18, type: "sine" },
  ],
  tradeFail: [
    { frequency: 300, duration: 0.18, gain: 0.2, type: "sawtooth" },
    { frequency: 180, duration: 0.2, delay: 0.1, gain: 0.22, type: "triangle" },
  ],
  tradeStart: [
    { frequency: 450, duration: 0.1, gain: 0.2, type: "square" },
    { frequency: 520, duration: 0.12, delay: 0.08, gain: 0.2, type: "square" },
  ],
  turnEnd: [
    { frequency: 280, duration: 0.12, gain: 0.22, type: "triangle" },
    { frequency: 200, duration: 0.16, delay: 0.09, gain: 0.2, type: "sine" },
  ],
  robber: [
    { frequency: 150, duration: 0.18, gain: 0.22, type: "sawtooth" },
    { frequency: 110, duration: 0.2, delay: 0.12, gain: 0.24, type: "triangle" },
    { frequency: 80, duration: 0.25, delay: 0.22, gain: 0.2, type: "sine" },
  ],
};

let audioContext: AudioContext | null = null;
let audioUnlocked = false;

function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (audioContext) {
    return audioContext;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }
  audioContext = new AudioCtx();
  return audioContext;
}

function getAudioContext(): AudioContext | null {
  if (!audioUnlocked) {
    return null;
  }
  return createAudioContext();
}

export async function resumeAudioContext() {
  audioUnlocked = true;
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // If resume fails the browser still blocks playback; keep unlocked so the next gesture can retry.
    }
  }
}

export async function playSound(effect: SoundEffect) {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const steps = SOUND_LIBRARY[effect];
  if (!steps) {
    return;
  }

  const baseTime = ctx.currentTime;
  steps.forEach((step) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = step.type ?? "sine";
    osc.frequency.value = step.frequency;
    const gainValue = step.gain ?? 0.18;
    gainNode.gain.value = gainValue;
    osc.connect(gainNode).connect(ctx.destination);
    const startTime = baseTime + (step.delay ?? 0);
    const stopTime = startTime + step.duration;
    gainNode.gain.setValueAtTime(gainValue, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime);
    osc.start(startTime);
    osc.stop(stopTime);
  });
}

export type { SoundEffect };
