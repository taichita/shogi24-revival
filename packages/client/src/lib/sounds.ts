"use client";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** 駒を置く音（パチッ） */
export function playMoveSound(): void {
  try {
    const ctx = getCtx();
    // 短いノイズバースト + 軽いトーン
    const duration = 0.08;
    const now = ctx.currentTime;

    // ノイズ（パチッ感）
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // バンドパスフィルタ（木の音っぽく）
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

    // アタック音（ピシッ）
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
  } catch {
    // AudioContext未対応の場合は無視
  }
}

/** 秒読み電子音（ピッ） */
export function playBeep(long = false): void {
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
  } catch {
    // ignore
  }
}
