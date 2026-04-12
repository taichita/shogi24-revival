"use client";

/**
 * 音声ファイルの差し替え方法:
 * 1. packages/client/public/sounds/ に音声ファイルを置く
 * 2. 以下のファイル名で配置すると自動で使われる:
 *    - move.mp3   : 駒を置く音（パチッ）
 *    - beep.mp3   : 秒読みの短い電子音（ピッ）
 *    - beep-long.mp3 : 秒読みの長い電子音（ピーー）
 *    - end.mp3    : 対局終了音
 * 3. ファイルが存在しない場合はWeb Audio APIで合成した音が鳴る
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// 音声ファイルのキャッシュ
const audioCache = new Map<string, HTMLAudioElement | null>();

/** 音声ファイルを再生。なければfallbackを実行 */
function playFile(path: string, fallback: () => void): void {
  // キャッシュ済みで存在しないことが分かっている
  if (audioCache.has(path) && audioCache.get(path) === null) {
    fallback();
    return;
  }

  // キャッシュ済みで存在する
  const cached = audioCache.get(path);
  if (cached) {
    cached.currentTime = 0;
    cached.play().catch(() => {});
    return;
  }

  // 初回: ファイルの存在確認
  const audio = new Audio(path);
  audio.addEventListener("canplaythrough", () => {
    audioCache.set(path, audio);
    audio.play().catch(() => {});
  }, { once: true });
  audio.addEventListener("error", () => {
    audioCache.set(path, null); // 存在しないとマーク
    fallback();
  }, { once: true });
  audio.load();
}

/** 駒を置く音（パチッ） */
export function playMoveSound(): void {
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
}

/** 秒読み電子音（ピッ） */
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

/** 対局終了音 */
export function playEndSound(): void {
  playFile("/sounds/end.mp3", () => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;

      // 低めの「ドン」という音
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

      // 高めの余韻「リーン」
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
