import type { Color } from '@shogi24/engine';
import type { ClockState, ClockSide, TimePreset } from './types.js';

function makeSide(preset: TimePreset): ClockSide {
  const startByoyomi = preset.mainTimeMs === 0;
  return {
    remainMs: startByoyomi ? preset.byoyomiMs : preset.mainTimeMs,
    inByoyomi: startByoyomi,
    considerRemainMs: preset.considerMs ?? 0,
    considerActive: false,
  };
}

/** 初期時計を作成 */
export function createClock(preset: TimePreset): ClockState {
  return {
    black: makeSide(preset),
    white: makeSide(preset),
  };
}

/**
 * 着手後の時計更新。
 * - 考慮時間発動中: 考慮時間を消費し、尽きたら秒読みから消費へフォールバック
 * - 秒読み中: リセットありなら秒読みリセット、なしなら消費し続ける
 * - 持ち時間中: elapsedを消費。0以下になったら即秒読み移行
 * - 秒読み切れ → timeout: true
 */
export function tickClock(
  clock: ClockState,
  color: Color,
  elapsedMs: number,
  preset: TimePreset,
): { clock: ClockState; timeout: boolean } {
  const side: ClockSide = { ...clock[color] };

  if (side.considerActive && side.considerRemainMs > 0) {
    // 考慮時間を消費
    const used = Math.min(elapsedMs, side.considerRemainMs);
    side.considerRemainMs -= used;
    elapsedMs -= used;
    if (side.considerRemainMs <= 0) {
      side.considerRemainMs = 0;
      side.considerActive = false;
    }
  }

  if (elapsedMs <= 0) {
    return { clock: { ...clock, [color]: side } as ClockState, timeout: false };
  }

  if (side.inByoyomi) {
    // 秒読み中
    side.remainMs -= elapsedMs;
    if (side.remainMs <= 0) {
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
      const overflow = -side.remainMs;
      side.inByoyomi = true;

      if (overflow >= preset.byoyomiMs) {
        side.remainMs = 0;
        return {
          clock: { ...clock, [color]: side } as ClockState,
          timeout: true,
        };
      }

      side.remainMs = preset.byoyomiMs - overflow;

      if (preset.byoyomiResets) {
        side.remainMs = preset.byoyomiMs;
      }
    }
  }

  // 着手が完了したので考慮時間発動は解除（次局面でまた発動できる）
  side.considerActive = false;

  return {
    clock: { ...clock, [color]: side } as ClockState,
    timeout: false,
  };
}
