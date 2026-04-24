import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  TIME_PRESETS,
  type ClientToServerEvents, type ServerToClientEvents,
  type InterServerEvents, type SocketData, type Player,
} from './types.js';
import { opponent, apply24Rating, createGame, makeMove as engineMakeMove } from '@shogi24/engine';
import { MatchManager } from './match-manager.js';
import { MatchQueue } from './queue.js';
import { Lobby } from './lobby.js';
import { initDb, loginOrCreate, updateRating, saveMatch, getUserById, setUserHandleAndRating, searchUsersByHandle, getMatchesForUser, getMatchById } from './db.js';
import { isValidInitialRating } from '@shogi24/engine';
import { authRouter, verifyToken } from './auth.js';

const PORT = Number(process.env.PORT ?? 3025);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3024', 'http://localhost:3000'];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));

// ヘルスチェック（Renderスリープ防止用）
app.get('/', (_req, res) => { res.send('ok'); });
app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

// ユーザー検索 (ハンドル名前方一致 or 登録番号)
app.get('/api/users/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim() ?? '';
  if (q.length === 0) { res.json({ users: [] }); return; }
  try {
    const users = await searchUsersByHandle(q);
    res.json({
      users: users.map(u => ({
        id: u.id, handle: u.handle, rating: u.rating,
        games: u.games, wins: u.wins, isGuest: !u.googleId,
        userNumber: u.userNumber,
      })),
    });
  } catch (e) {
    console.error('[api] search error:', e);
    res.status(500).json({ error: 'search failed' });
  }
});

// ユーザーの対局履歴取得
app.get('/api/users/:userId/matches', async (req, res) => {
  const userId = req.params.userId;
  try {
    const user = await getUserById(userId);
    if (!user) { res.status(404).json({ error: 'user not found' }); return; }
    const matches = await getMatchesForUser(userId);
    res.json({
      user: {
        id: user.id, handle: user.handle, rating: user.rating,
        games: user.games, wins: user.wins, isGuest: !user.googleId,
        userNumber: user.userNumber,
      },
      matches,
    });
  } catch (e) {
    console.error('[api] matches error:', e);
    res.status(500).json({ error: 'fetch failed' });
  }
});

// 対局詳細取得（棋譜再生用）
app.get('/api/matches/:matchId', async (req, res) => {
  try {
    const match = await getMatchById(req.params.matchId);
    if (!match) { res.status(404).json({ error: 'match not found' }); return; }
    res.json({ match });
  } catch (e) {
    console.error('[api] match detail error:', e);
    res.status(500).json({ error: 'fetch failed' });
  }
});

app.use('/auth', authRouter);
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

/** レート制限マップのクリーンアップ（定期実行） */
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of rateLimits) {
    if (now > entry.resetAt + 5000) rateLimits.delete(id);
  }
}, 30_000);

/** 入力サニタイズ: HTMLタグのみ除去（ReactがJSXで自動エスケープするため最小限） */
function sanitize(str: string): string {
  return str.replace(/[<>]/g, '').trim();
}

const matchManager = new MatchManager();
const queue = new MatchQueue();
const lobby = new Lobby();

/** userId → socketId マップ（重複ログイン防止） */
const userIdToSocketId = new Map<string, string>();

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

  const blackInfo = { handle: blackPlayer.handle, rating: blackPlayer.rating, isGuest: blackPlayer.isGuest };
  const whiteInfo = { handle: whitePlayer.handle, rating: whitePlayer.rating, isGuest: whitePlayer.isGuest };
  blackSocket?.emit('match.started', {
    matchId: room.id, black: blackInfo, white: whiteInfo,
    yourColor: 'black', timePreset: room.timePreset,
  });
  whiteSocket?.emit('match.started', {
    matchId: room.id, black: blackInfo, white: whiteInfo,
    yourColor: 'white', timePreset: room.timePreset,
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

    // 考慮時間発動中は考慮時間から優先消費
    let rem = elapsed;
    if (side.considerActive && side.considerRemainMs > 0) {
      const used = Math.min(rem, side.considerRemainMs);
      side.considerRemainMs -= used;
      rem -= used;
      if (side.considerRemainMs <= 0) {
        side.considerRemainMs = 0;
        side.considerActive = false;
      }
    }
    side.remainMs -= rem;

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
  const players = lobby.getAll().map(p => {
    const m = matchManager.getMatchByPlayer(p.id);
    return {
      id: p.id, handle: p.handle, rating: p.rating,
      status: p.status, preferredTime: p.preferredTime,
      matchId: m?.id, isGuest: p.isGuest,
    };
  });
  io.emit('lobby.snapshot', { players });
}

/** 対局終了時のレート更新＋ロビー状態戻し */
async function handleMatchEnd(matchId: string, result: { winner: string | null; reason: string }): Promise<void> {
  const room = matchManager.getMatch(matchId);
  if (!room) return;

  // ゲストが絡む対局はレート変動なし（対局記録のみ残す）
  const hasGuest = room.black.isGuest || room.white.isGuest;

  // 対局時のレートをスナップショット（Player 参照は socket.data.player と共有しており、
  // 後段で書き換わるため、saveMatch 用にここで値を固定する）
  const preBlackR = room.black.rating;
  const preWhiteR = room.white.rating;

  // 引き分け以外ならレート更新
  if (result.winner) {
    const winnerIsBlack = result.winner === 'black';
    const winnerR = winnerIsBlack ? preBlackR : preWhiteR;
    const loserR = winnerIsBlack ? preWhiteR : preBlackR;
    const rr = apply24Rating(winnerR, loserR);

    if (rr.rated && !hasGuest) {
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

      // DB永続化 (persistent userId を使用)
      const winnerUserId = winnerIsBlack ? room.black.userId : room.white.userId;
      const loserUserId = winnerIsBlack ? room.white.userId : room.black.userId;
      await updateRating(winnerUserId, rr.nextWinner, true);
      await updateRating(loserUserId, rr.nextLoser, false);

      console.log(`[rating] ${winnerIsBlack ? room.black.handle : room.white.handle} ${winnerR}→${rr.nextWinner} (+${rr.exchanged}), ${winnerIsBlack ? room.white.handle : room.black.handle} ${loserR}→${rr.nextLoser} (-${rr.exchanged})`);
    }

    // 対局記録は常に保存（ゲスト参加時もレート変動0で記録、棋譜はJSON保存）
    // blackRating/whiteRating は対局開始時の値（pre-match）を保存する
    const winnerUserId = winnerIsBlack ? room.black.userId : room.white.userId;
    await saveMatch({
      id: matchId,
      blackId: room.black.userId, whiteId: room.white.userId,
      winnerId: winnerUserId, result: result.reason,
      blackRating: preBlackR, whiteRating: preWhiteR,
      ratingDelta: (rr.rated && !hasGuest) ? rr.exchanged : 0,
      timePreset: room.timePreset.name,
      moves: room.game.moveCount,
      movesJson: JSON.stringify(room.game.moves),
    });
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

  // --- JWT自動認証 ---
  const token = socket.handshake.auth?.token as string | undefined;
  if (token) {
    (async () => {
    const dbUser = await verifyToken(token);
    if (dbUser) {
      // 重複ログイン防止: 同じuserIdの既存接続を切断
      const existingSocketId = userIdToSocketId.get(dbUser.id);
      if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);
        if (existingSocket) {
          existingSocket.emit('auth.kicked', { reason: '別のタブでログインされました' });
          existingSocket.disconnect(true);
          console.log(`[kick] ${dbUser.handle ?? dbUser.id} old=${existingSocketId} new=${socket.id}`);
        }
      }
      userIdToSocketId.set(dbUser.id, socket.id);

      if (!dbUser.handle) {
        // ハンドル名未設定 → 設定画面へ誘導
        socket.data.pendingUserId = dbUser.id;
        socket.emit('auth.needsHandle', { userId: dbUser.id });
        console.log(`[jwt-login] needs handle (${socket.id})`);
      } else {
        const player: Player = {
          id: socket.id,
          userId: dbUser.id,
          handle: dbUser.handle,
          rating: dbUser.rating,
          isGuest: !dbUser.googleId,
        };
        socket.data.player = player;
        lobby.join(player);
        socket.emit('auth.restored', { handle: dbUser.handle, rating: dbUser.rating, userId: dbUser.id });
        console.log(`[jwt-login] ${player.handle} (${socket.id})`);
        broadcastLobby();
      }
    }
    })();
  }

  // --- ハンドル認証（レガシー / Google未使用時） ---
  socket.on('auth.login', async ({ handle, initialRating }, cb) => {
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
    const startRating = (initialRating != null && isValidInitialRating(initialRating)) ? initialRating : 1500;
    const dbUser = await loginOrCreate(socket.id, cleanHandle, startRating);
    if ('error' in dbUser) {
      cb({ ok: false, error: dbUser.error });
      return;
    }
    const player: Player = {
      id: socket.id,
      userId: dbUser.id,
      handle: dbUser.handle!,
      rating: dbUser.rating,
      isGuest: true, // レガシーログインは常にゲスト扱い
    };
    socket.data.player = player;
    lobby.join(player);
    cb({ ok: true, playerId: socket.id });
    console.log(`[login] ${player.handle} (${socket.id})`);
    broadcastLobby();
  });

  // --- ハンドル名設定（Google認証後の初回のみ） ---
  socket.on('auth.setHandle', async ({ handle: rawHandle, initialRating }, cb) => {
    if (!checkRateLimit(socket.id, 3)) {
      cb({ ok: false, error: 'リクエストが多すぎます' });
      return;
    }
    const pendingUserId = socket.data.pendingUserId;
    if (!pendingUserId) {
      cb({ ok: false, error: '無効なリクエストです' });
      return;
    }
    if (!rawHandle || rawHandle.trim().length === 0) {
      cb({ ok: false, error: 'ハンドル名を入力してください' });
      return;
    }
    const cleanHandle = sanitize(rawHandle).slice(0, 20);
    if (cleanHandle.length === 0) {
      cb({ ok: false, error: '使用できない文字が含まれています' });
      return;
    }
    const startRating = (initialRating != null && isValidInitialRating(initialRating)) ? initialRating : 1500;
    const result = await setUserHandleAndRating(pendingUserId, cleanHandle, startRating);
    if (!result.ok) {
      cb({ ok: false, error: result.error });
      return;
    }
    const dbUser = await getUserById(pendingUserId);
    if (!dbUser || !dbUser.handle) {
      cb({ ok: false, error: '設定に失敗しました' });
      return;
    }
    // ロビーに参加
    const player: Player = {
      id: socket.id,
      userId: dbUser.id,
      handle: dbUser.handle,
      rating: dbUser.rating,
      isGuest: !dbUser.googleId,
    };
    socket.data.player = player;
    socket.data.pendingUserId = undefined;
    lobby.join(player);
    cb({ ok: true, handle: dbUser.handle, rating: dbUser.rating });
    console.log(`[setHandle] ${dbUser.handle} (${socket.id})`);
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

    const blackSocket = io.sockets.sockets.get(black.id);
    const whiteSocket = io.sockets.sockets.get(white.id);
    const blackPlayer = blackSocket?.data.player;
    const whitePlayer = whiteSocket?.data.player;
    if (!blackPlayer || !whitePlayer) return;

    startMatch(blackPlayer, whitePlayer, ch.timePreset);
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

  // --- 挑戦キャンセル（送った側から取り消し） ---
  socket.on('lobby.challenge.cancel', ({ challengeId }) => {
    const ch = lobby.getChallenge(challengeId);
    if (!ch) return;
    if (ch.from.id !== socket.id) return; // 送った本人のみキャンセル可
    lobby.removeChallenge(challengeId);

    // 相手側の挑戦通知を消す
    const toSocket = io.sockets.sockets.get(ch.to.id);
    toSocket?.emit('lobby.challenge.declined', { challengeId });
    console.log(`[challenge cancelled] ${ch.from.handle} cancelled challenge to ${ch.to.handle}`);
  });

  // --- 着手 ---
  socket.on('match.move', ({ matchId, move }) => {
    if (!checkRateLimit(socket.id, 5)) return;
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

  // --- チャット ---
  socket.on('chat.send', ({ matchId, message }) => {
    if (!checkRateLimit(socket.id, 1)) return;
    const player = socket.data.player;
    if (!player) return;
    const room = matchManager.getMatch(matchId);
    if (!room) return;
    if (room.black.id !== socket.id && room.white.id !== socket.id) return;
    const clean = sanitize(message).slice(0, 200);
    if (clean.length === 0) return;
    io.to(matchId).emit('chat.message', {
      matchId,
      sender: player.handle,
      message: clean,
      timestamp: Date.now(),
    });
  });

  // --- 投了 ---
  socket.on('match.resign', ({ matchId }) => {
    const result = matchManager.resign(matchId, socket.id);
    if (result) {
      const room = matchManager.getMatch(matchId);
      const clock = room?.clock ?? {
        black: { remainMs: 0, inByoyomi: false, considerRemainMs: 0, considerActive: false },
        white: { remainMs: 0, inByoyomi: false, considerRemainMs: 0, considerActive: false },
      };
      io.to(matchId).emit('match.result', { matchId, result, clock });
      handleMatchEnd(matchId, result);
    }
  });

  // --- 相手切断時の勝ち主張 ---
  socket.on('match.claimWin', ({ matchId }, cb) => {
    const room = matchManager.getMatch(matchId);
    if (!room) { cb({ ok: false, error: '対局が見つかりません' }); return; }
    if (room.game.result) { cb({ ok: false, error: '対局は既に終了しています' }); return; }

    const color = matchManager.getPlayerColor(room, socket.id);
    if (!color) { cb({ ok: false, error: '対局のプレイヤーではありません' }); return; }

    const oppId = color === 'black' ? room.white.id : room.black.id;
    const oppSocket = io.sockets.sockets.get(oppId);

    // 相手がまだ接続中なら却下
    if (oppSocket && oppSocket.connected) {
      cb({ ok: false, error: '相手はまだ接続中です。投了は「投了」ボタンから行ってください' });
      return;
    }

    // 相手切断確定 → 自分の勝ち
    const result = { winner: color, reason: 'disconnect' as const };
    room.game = { ...room.game, result };
    if (room.tickTimer) { clearInterval(room.tickTimer); room.tickTimer = undefined; }
    io.to(matchId).emit('match.result', { matchId, result, clock: room.clock });
    handleMatchEnd(matchId, result);
    cb({ ok: true });
    console.log(`[claimWin] ${socket.data.player?.handle} won by opponent disconnect (${matchId})`);
  });

  // --- 考慮時間トグル（早指し2などで使用） ---
  socket.on('match.toggleConsider', ({ matchId, active }, cb) => {
    const res = matchManager.toggleConsider(matchId, socket.id, !!active);
    if (res.ok) {
      const room = matchManager.getMatch(matchId);
      if (room) io.to(matchId).emit('match.clock', { matchId, clock: room.clock });
    }
    if (cb) cb(res);
  });

  // --- 観戦 ---
  socket.on('match.spectate', ({ matchId }, cb) => {
    const player = socket.data.player;
    if (!player) { cb({ ok: false, error: 'ログインしてください' }); return; }
    if (matchManager.getMatchByPlayer(player.id)) { cb({ ok: false, error: '対局中は観戦できません' }); return; }

    const room = matchManager.getMatch(matchId);
    if (!room) { cb({ ok: false, error: '対局が見つかりません' }); return; }

    socket.join(matchId);
    socket.data.spectatingMatchId = matchId;
    cb({ ok: true });

    socket.emit('match.spectate.started', {
      matchId: room.id,
      black: { handle: room.black.handle, rating: room.black.rating, isGuest: room.black.isGuest },
      white: { handle: room.white.handle, rating: room.white.rating, isGuest: room.white.isGuest },
      game: room.game,
      clock: room.clock,
      timePreset: room.timePreset,
      result: room.game.result ?? null,
    });
    console.log(`[spectate] ${player.handle} watching ${matchId}`);
  });

  socket.on('match.spectate.leave', ({ matchId }) => {
    socket.leave(matchId);
    socket.data.spectatingMatchId = undefined;
  });

  // --- 感想戦 ---
  socket.on('review.enter', ({ matchId }) => {
    const room = matchManager.getMatch(matchId);
    if (!room || !room.game.result) return;
    const player = socket.data.player;
    if (!player) return;
    const isBlack = room.black.id === socket.id;
    const isWhite = room.white.id === socket.id;
    if (!isBlack && !isWhite) return;

    if (!room.review) {
      room.review = {
        blackBoard: JSON.parse(JSON.stringify(room.game)),
        whiteBoard: JSON.parse(JSON.stringify(room.game)),
        blackHistory: [],
        whiteHistory: [],
        blackActive: false,
        whiteActive: false,
        finalGame: JSON.parse(JSON.stringify(room.game)),
      };
    }
    if (isBlack) room.review.blackActive = true;
    if (isWhite) room.review.whiteActive = true;

    const myBoard = isBlack ? room.review.blackBoard : room.review.whiteBoard;
    socket.emit('review.entered', { matchId, board: myBoard });
    console.log(`[review] ${player.handle} entered review for ${matchId}`);
  });

  socket.on('review.move', ({ matchId, move }) => {
    const room = matchManager.getMatch(matchId);
    if (!room?.review) return;
    const isBlack = room.black.id === socket.id;
    const isWhite = room.white.id === socket.id;
    if (!isBlack && !isWhite) return;

    const color = isBlack ? 'black' : 'white';
    const board = isBlack ? room.review.blackBoard : room.review.whiteBoard;
    const history = isBlack ? room.review.blackHistory : room.review.whiteHistory;

    try {
      const newBoard = engineMakeMove(board, move);
      history.push(board);
      if (isBlack) room.review.blackBoard = newBoard;
      else room.review.whiteBoard = newBoard;
      io.to(matchId).emit('review.snapshot', { matchId, color, board: newBoard });
    } catch {
      // 不正な手は無視
    }
  });

  socket.on('review.undo', ({ matchId }) => {
    const room = matchManager.getMatch(matchId);
    if (!room?.review) return;
    const isBlack = room.black.id === socket.id;
    const isWhite = room.white.id === socket.id;
    if (!isBlack && !isWhite) return;

    const color = isBlack ? 'black' : 'white';
    const history = isBlack ? room.review.blackHistory : room.review.whiteHistory;
    const prev = history.pop();
    if (!prev) return;

    if (isBlack) room.review.blackBoard = prev;
    else room.review.whiteBoard = prev;
    io.to(matchId).emit('review.snapshot', { matchId, color, board: prev });
  });

  socket.on('review.reset', ({ matchId, position }) => {
    const room = matchManager.getMatch(matchId);
    if (!room?.review) return;
    const isBlack = room.black.id === socket.id;
    const isWhite = room.white.id === socket.id;
    if (!isBlack && !isWhite) return;

    const color = isBlack ? 'black' : 'white';
    const resetBoard = position === 'initial'
      ? createGame()
      : JSON.parse(JSON.stringify(room.review.finalGame));

    if (isBlack) { room.review.blackBoard = resetBoard; room.review.blackHistory = []; }
    else { room.review.whiteBoard = resetBoard; room.review.whiteHistory = []; }
    io.to(matchId).emit('review.snapshot', { matchId, color, board: resetBoard });
  });

  socket.on('review.leave', ({ matchId }) => {
    const room = matchManager.getMatch(matchId);
    if (!room?.review) return;
    const isBlack = room.black.id === socket.id;
    const isWhite = room.white.id === socket.id;
    if (!isBlack && !isWhite) return;

    const color = isBlack ? 'black' : 'white';
    if (isBlack) room.review.blackActive = false;
    if (isWhite) room.review.whiteActive = false;
    io.to(matchId).emit('review.left', { matchId, color });
  });

  // --- 感想戦: 任意の盤面状態に設定（ナビゲーション/変化手順） ---
  socket.on('review.setBoard', ({ matchId, board }) => {
    const room = matchManager.getMatch(matchId);
    if (!room?.review) return;
    const isBlack = room.black.id === socket.id;
    const isWhite = room.white.id === socket.id;
    if (!isBlack && !isWhite) return;

    const color = isBlack ? 'black' : 'white';
    if (isBlack) room.review.blackBoard = board;
    else room.review.whiteBoard = board;
    // 両者にブロードキャストして相手側に反映
    io.to(matchId).emit('review.snapshot', { matchId, color, board });
  });

  // --- 切断 ---
  socket.on('disconnect', () => {
    const player = socket.data.player;
    console.log(`[disconnect] ${player?.handle ?? socket.id}`);

    // userIdToSocketIdのクリーンアップ（現在の接続のみ削除）
    if (player?.userId) {
      const current = userIdToSocketId.get(player.userId);
      if (current === socket.id) userIdToSocketId.delete(player.userId);
    }
    const pendingId = socket.data.pendingUserId;
    if (pendingId) {
      const current = userIdToSocketId.get(pendingId);
      if (current === socket.id) userIdToSocketId.delete(pendingId);
    }

    queue.remove(socket.id);
    lobby.leave(socket.id);

    const disc = matchManager.handleDisconnect(socket.id);
    if (disc) {
      const room = matchManager.getMatch(disc.matchId);
      const clock = room?.clock ?? {
        black: { remainMs: 0, inByoyomi: false, considerRemainMs: 0, considerActive: false },
        white: { remainMs: 0, inByoyomi: false, considerRemainMs: 0, considerActive: false },
      };
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
