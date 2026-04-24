import { createGame, makeMove, isCheckmate, opponent } from '@shogi24/engine';
import type { Move, Color, GameResult } from '@shogi24/engine';
import type { MatchRoom, Player } from './types.js';
import { TIME_PRESETS } from './types.js';
import { createClock } from './clock.js';

let matchIdCounter = 0;

function nextMatchId(): string {
  return `m_${++matchIdCounter}_${Date.now().toString(36)}`;
}

export class MatchManager {
  private matches = new Map<string, MatchRoom>();
  // player socket.id → matchId
  private playerMatch = new Map<string, string>();

  /** 対局を作成して開始 */
  createMatch(black: Player, white: Player, presetKey?: string): MatchRoom {
    const preset = TIME_PRESETS[presetKey ?? 'normal'] ?? TIME_PRESETS['normal'];
    const id = nextMatchId();
    const room: MatchRoom = {
      id,
      black,
      white,
      game: createGame(),
      clock: createClock(preset),
      timePreset: preset,
      lastMoveTime: Date.now(),
    };
    this.matches.set(id, room);
    this.playerMatch.set(black.id, id);
    this.playerMatch.set(white.id, id);
    return room;
  }

  /** 対局を取得 */
  getMatch(matchId: string): MatchRoom | undefined {
    return this.matches.get(matchId);
  }

  /** プレイヤーの現在の対局を取得 */
  getMatchByPlayer(playerId: string): MatchRoom | undefined {
    const matchId = this.playerMatch.get(playerId);
    return matchId ? this.matches.get(matchId) : undefined;
  }

  /** プレイヤーの色を判定 */
  getPlayerColor(match: MatchRoom, playerId: string): Color | null {
    if (match.black.id === playerId) return 'black';
    if (match.white.id === playerId) return 'white';
    return null;
  }

  /** 着手を実行。成功時はmoveとclock、失敗時はerror */
  applyMove(
    matchId: string,
    playerId: string,
    move: Move,
  ): { ok: true; move: Move; clock: MatchRoom['clock']; result?: GameResult }
    | { ok: false; error: string } {

    const room = this.matches.get(matchId);
    if (!room) return { ok: false, error: '対局が見つかりません' };
    if (room.game.result) return { ok: false, error: '対局は既に終了しています' };

    const color = this.getPlayerColor(room, playerId);
    if (!color) return { ok: false, error: 'この対局のプレイヤーではありません' };
    if (room.game.turn !== color) return { ok: false, error: '手番ではありません' };

    // 時計更新: tickタイマーがリアルタイムで減算済み。
    // ここでは最後のtickからの端数を反映し、秒読みリセットを行う
    const now = Date.now();
    let elapsed = now - room.lastMoveTime;
    const side = room.clock[color as 'black' | 'white'];

    // 考慮時間発動中は考慮時間から優先消費
    if (side.considerActive && side.considerRemainMs > 0) {
      const used = Math.min(elapsed, side.considerRemainMs);
      side.considerRemainMs -= used;
      elapsed -= used;
      if (side.considerRemainMs <= 0) {
        side.considerRemainMs = 0;
        side.considerActive = false;
      }
    }

    side.remainMs -= elapsed;

    if (side.remainMs <= 0) {
      if (side.inByoyomi) {
        // 秒読み切れ
        side.remainMs = 0;
        const result: GameResult = { winner: opponent(color), reason: 'timeout' };
        room.game = { ...room.game, result };
        this.clearTimer(room);
        return { ok: true, move, clock: room.clock, result };
      }
      // 持ち時間切れ → 秒読みへ
      const overflow = -side.remainMs;
      side.inByoyomi = true;
      side.remainMs = room.timePreset.byoyomiMs - overflow;
      if (side.remainMs <= 0) {
        side.remainMs = 0;
        const result: GameResult = { winner: opponent(color), reason: 'timeout' };
        room.game = { ...room.game, result };
        this.clearTimer(room);
        return { ok: true, move, clock: room.clock, result };
      }
    }

    // 秒読みリセット（着手完了したので）
    if (side.inByoyomi && room.timePreset.byoyomiResets) {
      side.remainMs = room.timePreset.byoyomiMs;
    }

    // 着手完了 → 考慮時間発動は解除（残りは次局面で再発動できる）
    side.considerActive = false;

    room.lastMoveTime = now;


    // 合法手検証・適用
    try {
      room.game = makeMove(room.game, move);
    } catch {
      return { ok: false, error: '不正な手です' };
    }

    // 詰み判定
    if (isCheckmate(room.game)) {
      const result: GameResult = { winner: color, reason: 'checkmate' };
      room.game = { ...room.game, result };
      this.clearTimer(room);
      return { ok: true, move, clock: room.clock, result };
    }

    return { ok: true, move, clock: room.clock };
  }

  /** 投了 */
  resign(matchId: string, playerId: string): GameResult | null {
    const room = this.matches.get(matchId);
    if (!room || room.game.result) return null;

    const color = this.getPlayerColor(room, playerId);
    if (!color) return null;

    const result: GameResult = { winner: opponent(color), reason: 'resign' };
    room.game = { ...room.game, result };
    this.clearTimer(room);
    return result;
  }

  /** 切断処理 */
  handleDisconnect(playerId: string): { matchId: string; result: GameResult } | null {
    const matchId = this.playerMatch.get(playerId);
    if (!matchId) return null;

    const room = this.matches.get(matchId);
    if (!room || room.game.result) return null;

    const color = this.getPlayerColor(room, playerId);
    if (!color) return null;

    const result: GameResult = { winner: opponent(color), reason: 'disconnect' };
    room.game = { ...room.game, result };
    this.clearTimer(room);
    return { matchId, result };
  }

  /** 考慮時間の発動切替 */
  toggleConsider(
    matchId: string,
    playerId: string,
    active: boolean,
  ): { ok: boolean; error?: string } {
    const room = this.matches.get(matchId);
    if (!room) return { ok: false, error: '対局が見つかりません' };
    if (room.game.result) return { ok: false, error: '対局は既に終了しています' };

    const color = this.getPlayerColor(room, playerId);
    if (!color) return { ok: false, error: 'この対局のプレイヤーではありません' };
    if (room.game.turn !== color) return { ok: false, error: '手番ではありません' };

    const side = room.clock[color];
    if ((side.considerRemainMs ?? 0) <= 0) {
      return { ok: false, error: '考慮時間は残っていません' };
    }

    // 発動/解除のタイミングで現在のtick端数を反映
    const now = Date.now();
    const elapsed = now - room.lastMoveTime;
    if (elapsed > 0) {
      if (side.considerActive && side.considerRemainMs > 0) {
        const used = Math.min(elapsed, side.considerRemainMs);
        side.considerRemainMs -= used;
        if (side.considerRemainMs <= 0) side.considerRemainMs = 0;
      } else {
        side.remainMs -= elapsed;
      }
      room.lastMoveTime = now;
    }

    side.considerActive = active && side.considerRemainMs > 0;
    return { ok: true };
  }

  /** 対局のクリーンアップ */
  removeMatch(matchId: string): void {
    const room = this.matches.get(matchId);
    if (room) {
      this.clearTimer(room);
      this.playerMatch.delete(room.black.id);
      this.playerMatch.delete(room.white.id);
      this.matches.delete(matchId);
    }
  }

  private clearTimer(room: MatchRoom): void {
    if (room.tickTimer) {
      clearInterval(room.tickTimer);
      room.tickTimer = undefined;
    }
  }
}
