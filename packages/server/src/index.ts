import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  TIME_PRESETS,
  type ClientToServerEvents, type ServerToClientEvents,
  type InterServerEvents, type SocketData, type Player,
} from './types.js';
import { opponent, apply24Rating } from '@shogi24/engine';
import { MatchManager } from './match-manager.js';
import { MatchQueue } from './queue.js';
import { Lobby } from './lobby.js';
import { initDb, loginOrCreate, updateRating, saveMatch } from './db.js';

const PORT = Number(process.env.PORT ?? 3025);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3024', 'http://localhost:3000'];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
const httpServer = createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: ALLOWED_ORIGINS },
  connectionStateRecovery: {},
});

// ============================================================
// セキュリティ: レート制限・入力検証
// ============================================================

/** IPごとの接続数制限 */
const ipConnections = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 5;

io.use((socket, next) => {
  const ip = socket.handshake.address;
  const current = ipConnections.get(ip) ?? 0;
  if (current >= MAX_CONNECTIONS_PER_IP) {
    return next(new Error('接続数上限です'));
  }
  ipConnections.set(ip, current + 1);
  socket.on('disconnect', () => {
    const c = ipConnections.get(ip) ?? 1;
    if (c <= 1) ipConnections.delete(ip);
    else ipConnections.set(ip, c - 1);
  });
  next();
});

/** イベントレート制限 (1秒あたりの最大イベント数) */
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(socketId: string, maxPerSec = 10): boolean {
  const now = Date.now();
  let entry = rateLimits.get(socketId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 1000 };
    rateLimits.set(socketId, entry);
  }
  entry.count++;
  return entry.count <= maxPerSec;
}

/** 入力サニタイズ: HTMLタグ除去 */
function sanitize(str: string): string {
  return str.replace(/[<>&"']/g, '').trim();
}

const matchManager = new MatchManager();
const queue = new MatchQueue();
const lobby = new Lobby();

// ============================================================
// ヘルパー: 対局開始
// ============================================================

function startMatch(blackPlayer: Player, whitePlayer: Player, presetKey: string): void {
  console.log(`[startMatch] preset=${presetKey}, TIME_PRESETS keys=${Object.keys(TIME_PRESETS).join(',')}`);
  const room = matchManager.createMatch(blackPlayer, whitePlayer, presetKey);
  console.log(`[startMatch] actual preset: ${room.timePreset.name}, mainTime=${room.timePreset.mainTimeMs}, byoyomi=${room.timePreset.byoyomiMs}`);

  lobby.setStatus(blackPlayer.id, 'playing');
  lobby.setStatus(whitePlayer.id, 'playing');
  broadcastLobby();

  const blackSocket = io.sockets.sockets.get(blackPlayer.id);
  const whiteSocket = io.sockets.sockets.get(whitePlayer.id);

  blackSocket?.join(room.id);
  whiteSocket?.join(room.id);

  blackSocket?.emit('match.started', {
    matchId: room.id,
    black: { handle: blackPlayer.handle, rating: blackPlayer.rating },
    white: { handle: whitePlayer.handle, rating: whitePlayer.rating },
    yourColor: 'black',
    timePreset: room.timePreset,
  });
  whiteSocket?.emit('match.started', {
    matchId: room.id,
    black: { handle: blackPlayer.handle, rating: blackPlayer.rating },
    white: { handle: whitePlayer.handle, rating: whitePlayer.rating },
    yourColor: 'white',
    timePreset: room.timePreset,
  });

  io.to(room.id).emit('match.snapshot', {
    matchId: room.id,
    game: room.game,
    clock: room.clock,
  });

  console.log(`[match] ${blackPlayer.handle} vs ${whitePlayer.handle} (${room.id})`);

  // 1秒ごとに手番側の時計を実際に更新
  room.tickTimer = setInterval(() => {
    if (room.game.result) { clearInterval(room.tickTimer); return; }

    const now = Date.now();
    const elapsed = now - room.lastMoveTime;
    room.lastMoveTime = now; // 基準時刻をリセット

    const color = room.game.turn;
    const side = room.clock[color];
    side.remainMs -= elapsed;

    if (side.remainMs <= 0) {
      if (side.inByoyomi) {
        // 秒読み切れ → 負け
        side.remainMs = 0;
        const result = { winner: opponent(color), reason: 'timeout' as const };
        room.game = { ...room.game, result };
        clearInterval(room.tickTimer);
        io.to(room.id).emit('match.result', { matchId: room.id, result, clock: room.clock });
        handleMatchEnd(room.id, result);
        return;
      }
      // 持ち時間切れ → 秒読みに移行
      const overflow = -side.remainMs;
      side.inByoyomi = true;
      side.remainMs = room.timePreset.byoyomiMs - overflow;
      if (side.remainMs <= 0) {
        // 秒読みすら超過 → 負け
        side.remainMs = 0;
        const result = { winner: opponent(color), reason: 'timeout' as const };
        room.game = { ...room.game, result };
        clearInterval(room.tickTimer);
        io.to(room.id).emit('match.result', { matchId: room.id, result, clock: room.clock });
        handleMatchEnd(room.id, result);
        return;
      }
    }

    io.to(room.id).emit('match.clock', { matchId: room.id, clock: room.clock });
  }, 1000);
}

function broadcastLobby(): void {
  const players = lobby.getAll().map(p => ({
    id: p.id, handle: p.handle, rating: p.rating,
    status: p.status, preferredTime: p.preferredTime,
  }));
  io.emit('lobby.snapshot', { players });
}

/** 対局終了時のレート更新＋ロビー状態戻し */
function handleMatchEnd(matchId: string, result: { winner: string | null; reason: string }): void {
  const room = matchManager.getMatch(matchId);
  if (!room) return;

  // 引き分け以外ならレート更新
  if (result.winner) {
    const winnerIsBlack = result.winner === 'black';
    const winnerR = winnerIsBlack ? room.black.rating : room.white.rating;
    const loserR = winnerIsBlack ? room.white.rating : room.black.rating;
    const rr = apply24Rating(winnerR, loserR);

    if (rr.rated) {
      // メモリ上のプレイヤーレート更新
      const winnerId = winnerIsBlack ? room.black.id : room.white.id;
      const loserId = winnerIsBlack ? room.white.id : room.black.id;

      const winnerSocket = io.sockets.sockets.get(winnerId);
      const loserSocket = io.sockets.sockets.get(loserId);
      if (winnerSocket?.data.player) winnerSocket.data.player.rating = rr.nextWinner;
      if (loserSocket?.data.player) loserSocket.data.player.rating = rr.nextLoser;

      // ロビーのレートも更新
      const wp = lobby.getPlayer(winnerId);
      const lp = lobby.getPlayer(loserId);
      if (wp) wp.rating = rr.nextWinner;
      if (lp) lp.rating = rr.nextLoser;

      // DB永続化
      updateRating(winnerId, rr.nextWinner, true);
      updateRating(loserId, rr.nextLoser, false);

      console.log(`[rating] ${winnerIsBlack ? room.black.handle : room.white.handle} ${winnerR}→${rr.nextWinner} (+${rr.exchanged}), ${winnerIsBlack ? room.white.handle : room.black.handle} ${loserR}→${rr.nextLoser} (-${rr.exchanged})`);

      // 対局記録保存
      saveMatch({
        id: matchId,
        blackId: room.black.id, whiteId: room.white.id,
        winnerId, result: result.reason,
        blackRating: room.black.rating, whiteRating: room.white.rating,
        ratingDelta: rr.exchanged, timePreset: room.timePreset.name,
        moves: room.game.moveCount,
      });
    }
  }

  lobby.setStatus(room.black.id, 'idle');
  lobby.setStatus(room.white.id, 'idle');
  broadcastLobby();
}

// ============================================================
// 接続ハンドラ
// ============================================================

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // --- 認証 ---
  socket.on('auth.login', ({ handle }, cb) => {
    if (!checkRateLimit(socket.id, 3)) {
      cb({ ok: false, error: 'リクエストが多すぎます' });
      return;
    }
    if (!handle || handle.trim().length === 0) {
      cb({ ok: false, error: 'ハンドル名を入力してください' });
      return;
    }
    const cleanHandle = sanitize(handle).slice(0, 20);
    if (cleanHandle.length === 0) {
      cb({ ok: false, error: '使用できない文字が含まれています' });
      return;
    }
    // DBからレート読み込み（なければ新規作成）
    const dbUser = loginOrCreate(socket.id, cleanHandle);
    const player: Player = {
      id: socket.id,
      handle: dbUser.handle,
      rating: dbUser.rating,
    };
    socket.data.player = player;
    lobby.join(player);
    cb({ ok: true, playerId: socket.id });
    console.log(`[login] ${player.handle} (${socket.id})`);
    broadcastLobby();
  });

  // --- 希望持ち時間変更 ---
  socket.on('lobby.setTime', ({ preset }) => {
    lobby.setPreferredTime(socket.id, preset);
    broadcastLobby();
  });

  // --- ステータス変更（休憩室⇔待機室⇔オートマッチ） ---
  socket.on('lobby.setStatus', ({ status }) => {
    const player = socket.data.player;
    if (!player) return;
    if (matchManager.getMatchByPlayer(player.id)) return; // 対局中は変更不可

    if (status === 'automatch') {
      // オートマッチに切替 → キューに入れる
      lobby.setStatus(player.id, 'automatch');
      const presetKey = lobby.getPlayer(player.id)?.preferredTime ?? 'normal';
      const pair = queue.enqueue(player, presetKey);
      if (pair) {
        startMatch(pair.black, pair.white, presetKey);
      }
    } else {
      // 待機室 or 休憩室 → キューから除去
      queue.remove(player.id);
      lobby.setStatus(player.id, status);
    }
    broadcastLobby();
  });

  // --- クイックマッチ (後方互換) ---
  socket.on('match.quickstart', ({ timePreset }, cb) => {
    const player = socket.data.player;
    if (!player) { cb({ ok: false, error: 'ログインしてください' }); return; }
    if (matchManager.getMatchByPlayer(player.id)) { cb({ ok: false, error: '既に対局中です' }); return; }

    const presetKey = timePreset ?? 'normal';
    lobby.setStatus(player.id, 'automatch');
    broadcastLobby();

    const pair = queue.enqueue(player, presetKey);
    if (!pair) {
      cb({ ok: true, matchId: '' });
      console.log(`[queue] ${player.handle} waiting (${presetKey})`);
      return;
    }

    cb({ ok: true, matchId: 'pending' });
    startMatch(pair.black, pair.white, presetKey);
  });

  // --- 手動挑戦 ---
  socket.on('lobby.challenge', ({ targetId, timePreset }, cb) => {
    const player = socket.data.player;
    if (!player) { cb({ ok: false, error: 'ログインしてください' }); return; }

    const result = lobby.sendChallenge(player.id, targetId, timePreset);
    if (typeof result === 'string') {
      cb({ ok: false, error: result });
      return;
    }

    cb({ ok: true, challengeId: result.id });

    // 相手に通知
    const targetSocket = io.sockets.sockets.get(targetId);
    targetSocket?.emit('lobby.challenge.received', {
      challengeId: result.id,
      from: { handle: player.handle, rating: player.rating },
      timePreset: result.timePreset,
    });
    console.log(`[challenge] ${player.handle} -> ${result.to.handle}`);
  });

  // --- 挑戦受諾 ---
  socket.on('lobby.challenge.accept', ({ challengeId }) => {
    const ch = lobby.getChallenge(challengeId);
    if (!ch) return;
    if (ch.to.id !== socket.id) return;

    lobby.removeChallenge(challengeId);

    // 先後ランダム
    const black = Math.random() < 0.5 ? ch.from : ch.to;
    const white = black.id === ch.from.id ? ch.to : ch.from;

    startMatch(
      { id: black.id, handle: black.handle, rating: black.rating },
      { id: white.id, handle: white.handle, rating: white.rating },
      ch.timePreset,
    );
    console.log(`[challenge accepted] ${ch.from.handle} vs ${ch.to.handle}`);
  });

  // --- 挑戦拒否 ---
  socket.on('lobby.challenge.decline', ({ challengeId }) => {
    const ch = lobby.getChallenge(challengeId);
    if (!ch) return;
    lobby.removeChallenge(challengeId);

    const fromSocket = io.sockets.sockets.get(ch.from.id);
    fromSocket?.emit('lobby.challenge.declined', { challengeId });
    console.log(`[challenge declined] ${ch.to.handle} declined ${ch.from.handle}`);
  });

  // --- 着手 ---
  socket.on('match.move', ({ matchId, move }) => {
    const result = matchManager.applyMove(matchId, socket.id, move);
    if (!result.ok) {
      socket.emit('match.error', { matchId, message: result.error });
      return;
    }
    io.to(matchId).emit('match.moved', { matchId, move: result.move, clock: result.clock });
    if (result.result) {
      io.to(matchId).emit('match.result', { matchId, result: result.result, clock: result.clock });
      handleMatchEnd(matchId, result.result);
    }
  });

  // --- 投了 ---
  socket.on('match.resign', ({ matchId }) => {
    const result = matchManager.resign(matchId, socket.id);
    if (result) {
      const room = matchManager.getMatch(matchId);
      const clock = room?.clock ?? { black: { remainMs: 0, inByoyomi: false }, white: { remainMs: 0, inByoyomi: false } };
      io.to(matchId).emit('match.result', { matchId, result, clock });
      handleMatchEnd(matchId, result);
    }
  });

  // --- 切断 ---
  socket.on('disconnect', () => {
    const player = socket.data.player;
    console.log(`[disconnect] ${player?.handle ?? socket.id}`);

    queue.remove(socket.id);
    lobby.leave(socket.id);

    const disc = matchManager.handleDisconnect(socket.id);
    if (disc) {
      const room = matchManager.getMatch(disc.matchId);
      const clock = room?.clock ?? { black: { remainMs: 0, inByoyomi: false }, white: { remainMs: 0, inByoyomi: false } };
      io.to(disc.matchId).emit('match.result', { matchId: disc.matchId, result: disc.result, clock });
      handleMatchEnd(disc.matchId, disc.result);
    } else {
      broadcastLobby();
    }
  });
});

// 古い挑戦を定期掃除
setInterval(() => lobby.cleanStale(), 10_000);

// ============================================================
// 起動
// ============================================================

async function main() {
  await initDb();
  httpServer.listen(PORT, () => {
    console.log(`Shogi24 server listening on http://localhost:${PORT}`);
  });
}
main();
