import type { Color } from '@shogi24/engine';
import type { ClockState, TimePreset } from './types.js';

/** 初期時計を作成 */
export function createClock(preset: TimePreset): ClockState {
  // 早指し2のように持ち時間0の場合は最初から秒読み
  const startByoyomi = preset.mainTimeMs === 0;
  return {
    black: {
      remainMs: startByoyomi ? preset.byoyomiMs : preset.mainTimeMs,
      inByoyomi: startByoyomi,
    },
    white: {
      remainMs: startByoyomi ? preset.byoyomiMs : preset.mainTimeMs,
      inByoyomi: startByoyomi,
    },
  };
}

/**
 * 着手後の時計更新。
 * - 持ち時間中: elapsedを消費。0以下になったら即秒読み移行
 * - 秒読み中: リセットありなら秒読みリセット、なしなら消費し続ける
 * - 秒読み切れ → timeout: true
 */
export function tickClock(
  clock: ClockState,
  color: Color,
  elapsedMs: number,
  preset: TimePreset,
): { clock: ClockState; timeout: boolean } {
  const side = { ...clock[color] };

  if (side.inByoyomi) {
    // 秒読み中
    side.remainMs -= elapsedMs;
    if (side.remainMs <= 0) {
      // 秒読み切れ → 負け
      side.remainMs = 0;
      return {
        clock: { ...clock, [color]: side } as ClockState,
        timeout: true,
      };
    }
    // 着手完了: 秒読みリセットありならリセット
    if (preset.byoyomiResets) {
      side.remainMs = preset.byoyomiMs;
    }
  } else {
    // 持ち時間消費
    side.remainMs -= elapsedMs;
    if (side.remainMs <= 0) {
      // 持ち時間切れ → 即秒読みに移行
      const overflow = -side.remainMs;
      side.inByoyomi = true;

      if (overflow >= preset.byoyomiMs) {
        // 秒読みすら超過 → 即負け
        side.remainMs = 0;
        return {
          clock: { ...clock, [color]: side } as ClockState,
          timeout: true,
        };
      }

      // 秒読み開始（溢れ分を差し引く）
      side.remainMs = preset.byoyomiMs - overflow;

      // 着手完了なのでリセット判定
      if (preset.byoyomiResets) {
        side.remainMs = preset.byoyomiMs;
      }
    }
  }

  return {
    clock: { ...clock, [color]: side } as ClockState,
    timeout: false,
  };
}
