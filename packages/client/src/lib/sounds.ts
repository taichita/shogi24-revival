"use client";

/**
 * 音声ファイル配置: packages/client/public/sounds/
 *
 * 命名規則（すべて小文字、ハイフン区切り）:
 *   bgm.mp3        — BGM（ループ再生）
 *   start.mp3      — 対局開始
 *   move-1.m4a     — 駒音パターン1（ランダムで再生）
 *   move-2.m4a     — 駒音パターン2
 *   end.mp3        — 対局終了
 *   challenge.mp3  — 挑戦通知
 *   beep.mp3       — 秒読み短音
 *   beep-long.mp3  — 秒読み長音
 *
 * ファイルが存在しない場合はWeb Audio APIの合成音にフォールバック。
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// ============================================================
// ファイル再生ユーティリティ
// ============================================================

const audioCache = new Map<string, HTMLAudioElement | null>();

function playFile(path: string, fallback: () => void): void {
  if (audioCache.has(path) && audioCache.get(path) === null) {
    fallback();
    return;
  }
  const cached = audioCache.get(path);
  if (cached) {
    const clone = cached.cloneNode() as HTMLAudioElement;
    clone.play().catch(() => {});
    return;
  }
  const audio = new Audio(path);
  audio.addEventListener("canplaythrough", () => {
    audioCache.set(path, audio);
    audio.play().catch(() => {});
  }, { once: true });
  audio.addEventListener("error", () => {
    audioCache.set(path, null);
    fallback();
  }, { once: true });
  audio.load();
}

// ============================================================
// BGM
// ============================================================

let bgmAudio: HTMLAudioElement | null = null;
let bgmEnabled = false;

const BGM_STORAGE_KEY = "r24_bgm_enabled";

/** BGMの初期状態をlocalStorageから読み込む */
export function getBgmEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(BGM_STORAGE_KEY);
  return stored === "true";
}

/** BGMのオンオフを切り替える */
export function setBgmEnabled(enabled: boolean): void {
  bgmEnabled = enabled;
  if (typeof window !== "undefined") {
    localStorage.setItem(BGM_STORAGE_KEY, String(enabled));
  }
  if (enabled) {
    startBgm();
  } else {
    stopBgm();
  }
}

function startBgm(): void {
  if (bgmAudio) {
    bgmAudio.play().catch(() => {});
    return;
  }
  bgmAudio = new Audio("/sounds/bgm.mp3");
  bgmAudio.loop = true;
  bgmAudio.volume = 0.1;
  bgmAudio.play().catch(() => {});
}

function stopBgm(): void {
  if (bgmAudio) {
    bgmAudio.pause();
  }
}

// ============================================================
// SE
// ============================================================

/** 駒を置く音（2種ランダム） */
export function playMoveSound(): void {
  const variant = Math.random() < 0.5 ? 1 : 2;
  playFile(`/sounds/move-${variant}.m4a`, () => {
    // 両方なければ合成音にフォールバック
    playFile("/sounds/move.mp3", () => {
      try {
        const ctx = getCtx();
        const duration = 0.08;
        const now = ctx.currentTime;

        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 2500;
        filter.Q.value = 2;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        noise.connect(filter).connect(gain).connect(ctx.destination);
        noise.start(now);
        noise.stop(now + duration);

        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.15, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(oscGain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } catch {}
    });
  });
}

/** 秒読み電子音 */
export function playBeep(long = false): void {
  const path = long ? "/sounds/beep-long.mp3" : "/sounds/beep.mp3";
  playFile(path, () => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      const duration = long ? 0.8 : 0.12;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = long ? 880 : 1200;

      const gain = ctx.createGain();
      const vol = long ? 0.08 : 0.15;
      gain.gain.setValueAtTime(vol, now);
      if (long) {
        gain.gain.setValueAtTime(vol, now + duration - 0.05);
        gain.gain.linearRampToValueAtTime(0, now + duration);
      } else {
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      }
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  });
}

/** 対局開始音 */
export function playStartSound(): void {
  playFile("/sounds/start.mp3", () => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);

      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(900, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(350, now + 0.23);
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.5, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.27);
    } catch {}
  });
}

/** 挑戦通知音 */
export function playChallengeSound(): void {
  playFile("/sounds/challenge.mp3", () => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 880;
      const g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.25, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(g1).connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 1100;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.25, now + 0.2);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(g2).connect(ctx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.45);
    } catch {}
  });
}

/** 対局終了音 */
export function playEndSound(): void {
  playFile("/sounds/end.mp3", () => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 660;
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(now);
      osc2.stop(now + 1.0);
    } catch {}
  });
}
