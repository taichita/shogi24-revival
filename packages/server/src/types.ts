import type { Color, Move, GameState, GameResult } from '@shogi24/engine';

/** 時間方式 */
export interface TimePreset {
  name: string;
  mainTimeMs: number;    // 持ち時間 (ms)
  byoyomiMs: number;     // 秒読み (ms per move)
  byoyomiResets: boolean; // true=秒読みリセットあり(早指し1), false=切れたら負け(早指し2)
}

export const TIME_PRESETS: Record<string, TimePreset> = {
  'normal':  { name: '15分+60秒',   mainTimeMs: 15 * 60_000, byoyomiMs: 60_000, byoyomiResets: true },
  'rapid1':  { name: '早指し1',     mainTimeMs: 60_000,      byoyomiMs: 30_000, byoyomiResets: true },
  'rapid2':  { name: '早指し2',     mainTimeMs: 0,           byoyomiMs: 30_000, byoyomiResets: true },
  'long':    { name: '長考30分',    mainTimeMs: 30 * 60_000, byoyomiMs: 60_000, byoyomiResets: true },
};

/** 対局時計の状態 */
export interface ClockState {
  black: { remainMs: number; inByoyomi: boolean };
  white: { remainMs: number; inByoyomi: boolean };
}

/** サーバー上のプレイヤー */
export interface Player {
  id: string;        // socket.id
  userId: string;    // persistent DB id (UUID or socket.id for legacy)
  handle: string;
  rating: number;
}

/** 感想戦のボード状態 */
export interface ReviewState {
  blackBoard: GameState;
  whiteBoard: GameState;
  blackHistory: GameState[];  // undo用
  whiteHistory: GameState[];
  blackActive: boolean;
  whiteActive: boolean;
  finalGame: GameState;  // 対局終了時の盤面（リセット用）
}

/** サーバー上の対局 */
export interface MatchRoom {
  id: string;
  black: Player;
  white: Player;
  game: GameState;
  clock: ClockState;
  timePreset: TimePreset;
  lastMoveTime: number;  // Date.now()
  tickTimer?: ReturnType<typeof setInterval>;
  review?: ReviewState;
}

// ============================================================
// Socket.IO イベント型 (kit の socket-events.md 準拠)
// ============================================================

/** クライアント → サーバー */
export interface ClientToServerEvents {
  'auth.login': (data: { handle: string }, cb: (res: { ok: boolean; playerId?: string; error?: string }) => void) => void;
  'match.quickstart': (data: { timePreset?: string }, cb: (res: { ok: boolean; matchId?: string; error?: string }) => void) => void;
  'match.move': (data: { matchId: string; move: Move }) => void;
  'match.resign': (data: { matchId: string }) => void;
  'lobby.setTime': (data: { preset: string }) => void;
  'lobby.setStatus': (data: { status: 'idle' | 'resting' | 'automatch' }) => void;
  'lobby.challenge': (data: { targetId: string; timePreset: string }, cb: (res: { ok: boolean; challengeId?: string; error?: string }) => void) => void;
  'lobby.challenge.accept': (data: { challengeId: string }) => void;
  'lobby.challenge.decline': (data: { challengeId: string }) => void;
  'chat.send': (data: { matchId: string; message: string }) => void;
  'review.enter': (data: { matchId: string }) => void;
  'review.move': (data: { matchId: string; move: Move }) => void;
  'review.undo': (data: { matchId: string }) => void;
  'review.reset': (data: { matchId: string; position: 'initial' | 'final' }) => void;
  'review.leave': (data: { matchId: string }) => void;
}

/** サーバー → クライアント */
export interface ServerToClientEvents {
  'match.started': (data: {
    matchId: string;
    black: { handle: string; rating: number };
    white: { handle: string; rating: number };
    yourColor: Color;
    timePreset: TimePreset;
  }) => void;
  'match.snapshot': (data: {
    matchId: string;
    game: GameState;
    clock: ClockState;
  }) => void;
  'match.moved': (data: {
    matchId: string;
    move: Move;
    clock: ClockState;
  }) => void;
  'match.result': (data: {
    matchId: string;
    result: GameResult;
    clock: ClockState;
  }) => void;
  'match.clock': (data: {
    matchId: string;
    clock: ClockState;
  }) => void;
  'match.error': (data: { matchId: string; message: string }) => void;
  'system.error': (data: { message: string }) => void;
  'lobby.snapshot': (data: { players: LobbyPlayerInfo[] }) => void;
  'lobby.updated': (data: { player: LobbyPlayerInfo }) => void;
  'lobby.playerLeft': (data: { playerId: string }) => void;
  'lobby.challenge.received': (data: { challengeId: string; from: { handle: string; rating: number }; timePreset: string }) => void;
  'lobby.challenge.declined': (data: { challengeId: string }) => void;
  'chat.message': (data: { matchId: string; sender: string; message: string; timestamp: number }) => void;
  'auth.restored': (data: { handle: string; rating: number; userId: string }) => void;
  'review.entered': (data: { matchId: string; board: GameState }) => void;
  'review.snapshot': (data: { matchId: string; color: Color; board: GameState }) => void;
  'review.left': (data: { matchId: string; color: Color }) => void;
}

export interface LobbyPlayerInfo {
  id: string;
  handle: string;
  rating: number;
  status: 'idle' | 'resting' | 'automatch' | 'playing';
  preferredTime: string;
}

export interface InterServerEvents {}
export interface SocketData {
  player?: Player;
}
