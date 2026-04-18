import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

/**
 * DB接続: 環境変数 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN があればTurso、
 * なければローカルファイル（開発時）を使う。
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

let client: Client;

export async function initDb(): Promise<void> {
  if (process.env.TURSO_DATABASE_URL) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    console.log('[db] using Turso');
  } else {
    mkdirSync(DATA_DIR, { recursive: true });
    const localPath = path.resolve(DATA_DIR, 'shogi24.db');
    client = createClient({ url: `file:${localPath}` });
    console.log(`[db] using local file: ${localPath}`);
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      handle       TEXT UNIQUE,
      google_id    TEXT UNIQUE,
      display_name TEXT,
      avatar_url   TEXT,
      rating       INTEGER NOT NULL DEFAULT 1500,
      games        INTEGER NOT NULL DEFAULT 0,
      wins         INTEGER NOT NULL DEFAULT 0,
      user_number  INTEGER UNIQUE,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id           TEXT PRIMARY KEY,
      black_id     TEXT NOT NULL,
      white_id     TEXT NOT NULL,
      winner_id    TEXT,
      result       TEXT NOT NULL,
      black_rating INTEGER NOT NULL,
      white_rating INTEGER NOT NULL,
      rating_delta INTEGER NOT NULL DEFAULT 0,
      time_preset  TEXT NOT NULL,
      moves        INTEGER NOT NULL DEFAULT 0,
      moves_json   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // マイグレーション: 既存DBにカラムがなければ追加（エラーは無視）
  try { await client.execute('ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE'); } catch {}
  try { await client.execute('ALTER TABLE users ADD COLUMN display_name TEXT'); } catch {}
  try { await client.execute('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch {}
  try { await client.execute('ALTER TABLE users ADD COLUMN user_number INTEGER'); } catch {}
  try { await client.execute("ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))"); } catch {}
  try { await client.execute('ALTER TABLE matches ADD COLUMN moves_json TEXT'); } catch {}

  console.log('[db] initialized');
}

// ============================================================
// ユーザー操作
// ============================================================

export interface DbUser {
  id: string;
  handle: string | null;
  googleId?: string;
  displayName?: string;
  avatarUrl?: string;
  rating: number;
  games: number;
  wins: number;
  userNumber?: number;
}

function rowToUser(row: Record<string, unknown>): DbUser {
  return {
    id: row.id as string,
    handle: (row.handle as string | null),
    googleId: (row.google_id as string | null) ?? undefined,
    displayName: (row.display_name as string | null) ?? undefined,
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    rating: Number(row.rating),
    games: Number(row.games),
    wins: Number(row.wins),
    userNumber: row.user_number != null ? Number(row.user_number) : undefined,
  };
}

/** 次のユーザー番号を取得 */
async function nextUserNumber(): Promise<number> {
  const res = await client.execute('SELECT COALESCE(MAX(user_number), 0) + 1 AS next FROM users');
  const row = res.rows[0] as unknown as Record<string, unknown>;
  return Number(row.next);
}

/** ハンドル名でログイン。なければ新規作成 */
export async function loginOrCreate(socketId: string, handle: string, initialRating = 1500): Promise<DbUser | { error: string }> {
  const res = await client.execute({ sql: 'SELECT * FROM users WHERE handle = ?', args: [handle] });
  if (res.rows.length > 0) {
    const row = res.rows[0] as unknown as Record<string, unknown>;
    const googleId = row.google_id as string | null;
    if (googleId) {
      return { error: 'このハンドル名はGoogle認証ユーザーが使用中です' };
    }
    // 既存レガシーユーザー: socketIdを更新
    await client.execute({ sql: 'UPDATE users SET id = ? WHERE handle = ?', args: [socketId, handle] });
    const user = rowToUser(row);
    return { ...user, id: socketId };
  }
  const userNumber = await nextUserNumber();
  await client.execute({
    sql: 'INSERT INTO users (id, handle, rating, games, wins, user_number) VALUES (?, ?, ?, 0, 0, ?)',
    args: [socketId, handle, initialRating, userNumber],
  });
  return { id: socketId, handle, rating: initialRating, games: 0, wins: 0, userNumber };
}

/** レート更新 */
export async function updateRating(userId: string, newRating: number, won: boolean): Promise<void> {
  await client.execute({
    sql: 'UPDATE users SET rating = ?, games = games + 1, wins = wins + ? WHERE id = ?',
    args: [newRating, won ? 1 : 0, userId],
  });
}

/** ハンドル名でユーザー取得 */
export async function getUserByHandle(handle: string): Promise<DbUser | undefined> {
  const res = await client.execute({ sql: 'SELECT * FROM users WHERE handle = ?', args: [handle] });
  if (res.rows.length === 0) return undefined;
  return rowToUser(res.rows[0] as unknown as Record<string, unknown>);
}

/** Google IDでユーザーを検索・作成 */
export async function findOrCreateGoogleUser(googleId: string, displayName: string, avatarUrl?: string): Promise<DbUser> {
  const res = await client.execute({ sql: 'SELECT * FROM users WHERE google_id = ?', args: [googleId] });
  if (res.rows.length > 0) {
    const row = res.rows[0] as unknown as Record<string, unknown>;
    await client.execute({
      sql: 'UPDATE users SET display_name = ?, avatar_url = ? WHERE google_id = ?',
      args: [displayName, avatarUrl ?? null, googleId],
    });
    return rowToUser(row);
  }
  // 新規作成: handleはNULL（初回ログイン時にユーザーが設定）
  const id = randomUUID();
  const userNumber = await nextUserNumber();
  await client.execute({
    sql: 'INSERT INTO users (id, google_id, display_name, avatar_url, rating, games, wins, user_number) VALUES (?, ?, ?, ?, 1500, 0, 0, ?)',
    args: [id, googleId, displayName, avatarUrl ?? null, userNumber],
  });
  return { id, handle: null, googleId, displayName, avatarUrl, rating: 1500, games: 0, wins: 0, userNumber };
}

/** ハンドル名と初期レートを設定（Google認証ユーザーの初回設定） */
export async function setUserHandleAndRating(userId: string, handle: string, initialRating = 1500): Promise<{ ok: boolean; error?: string }> {
  const existing = await client.execute({ sql: 'SELECT id FROM users WHERE handle = ?', args: [handle] });
  if (existing.rows.length > 0) {
    return { ok: false, error: 'このハンドル名は既に使用されています' };
  }
  // games=0 のユーザーのみレートも変更可能
  await client.execute({
    sql: 'UPDATE users SET handle = ?, rating = CASE WHEN games = 0 THEN ? ELSE rating END WHERE id = ?',
    args: [handle, initialRating, userId],
  });
  return { ok: true };
}

/** IDでユーザー取得 */
export async function getUserById(userId: string): Promise<DbUser | undefined> {
  const res = await client.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
  if (res.rows.length === 0) return undefined;
  return rowToUser(res.rows[0] as unknown as Record<string, unknown>);
}

// ============================================================
// 対局記録
// ============================================================

/** ハンドル名または登録番号でユーザー検索（最大20件） */
export async function searchUsersByHandle(query: string): Promise<DbUser[]> {
  // 数値のみなら番号検索も併用
  const num = /^\d+$/.test(query) ? Number(query) : null;
  let sql: string;
  let args: (string | number)[];
  if (num !== null) {
    sql = 'SELECT * FROM users WHERE user_number = ? OR handle LIKE ? ORDER BY rating DESC LIMIT 20';
    args = [num, `${query}%`];
  } else {
    sql = 'SELECT * FROM users WHERE handle LIKE ? ORDER BY rating DESC LIMIT 20';
    args = [`${query}%`];
  }
  const res = await client.execute({ sql, args });
  return res.rows.map(r => rowToUser(r as unknown as Record<string, unknown>));
}

export interface MatchRecord {
  id: string;
  blackId: string;
  whiteId: string;
  blackHandle: string | null;
  whiteHandle: string | null;
  winnerId: string | null;
  result: string;
  blackRating: number;
  whiteRating: number;
  ratingDelta: number;
  timePreset: string;
  moves: number;
  createdAt: string;
}

/** ユーザーIDで対局履歴を取得（新しい順、最大50件） */
export async function getMatchesForUser(userId: string): Promise<MatchRecord[]> {
  const res = await client.execute({
    sql: `SELECT m.*, b.handle AS black_handle, w.handle AS white_handle
          FROM matches m
          LEFT JOIN users b ON m.black_id = b.id
          LEFT JOIN users w ON m.white_id = w.id
          WHERE m.black_id = ? OR m.white_id = ?
          ORDER BY m.created_at DESC
          LIMIT 50`,
    args: [userId, userId],
  });
  return res.rows.map(r => {
    const row = r as unknown as Record<string, unknown>;
    return {
      id: row.id as string,
      blackId: row.black_id as string,
      whiteId: row.white_id as string,
      blackHandle: (row.black_handle as string | null) ?? null,
      whiteHandle: (row.white_handle as string | null) ?? null,
      winnerId: (row.winner_id as string | null) ?? null,
      result: row.result as string,
      blackRating: Number(row.black_rating),
      whiteRating: Number(row.white_rating),
      ratingDelta: Number(row.rating_delta),
      timePreset: row.time_preset as string,
      moves: Number(row.moves),
      createdAt: row.created_at as string,
    };
  });
}

export async function saveMatch(data: {
  id: string; blackId: string; whiteId: string; winnerId: string | null;
  result: string; blackRating: number; whiteRating: number;
  ratingDelta: number; timePreset: string; moves: number;
  movesJson: string;
}): Promise<void> {
  await client.execute({
    sql: `INSERT INTO matches (id, black_id, white_id, winner_id, result, black_rating, white_rating, rating_delta, time_preset, moves, moves_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.id, data.blackId, data.whiteId, data.winnerId, data.result,
      data.blackRating, data.whiteRating, data.ratingDelta, data.timePreset, data.moves, data.movesJson,
    ],
  });
}

/** 対局IDで対局詳細（棋譜含む）を取得 */
export async function getMatchById(matchId: string): Promise<(MatchRecord & { movesJson: string | null }) | undefined> {
  const res = await client.execute({
    sql: `SELECT m.*, b.handle AS black_handle, w.handle AS white_handle
          FROM matches m
          LEFT JOIN users b ON m.black_id = b.id
          LEFT JOIN users w ON m.white_id = w.id
          WHERE m.id = ?`,
    args: [matchId],
  });
  if (res.rows.length === 0) return undefined;
  const row = res.rows[0] as unknown as Record<string, unknown>;
  return {
    id: row.id as string,
    blackId: row.black_id as string,
    whiteId: row.white_id as string,
    blackHandle: (row.black_handle as string | null) ?? null,
    whiteHandle: (row.white_handle as string | null) ?? null,
    winnerId: (row.winner_id as string | null) ?? null,
    result: row.result as string,
    blackRating: Number(row.black_rating),
    whiteRating: Number(row.white_rating),
    ratingDelta: Number(row.rating_delta),
    timePreset: row.time_preset as string,
    moves: Number(row.moves),
    createdAt: row.created_at as string,
    movesJson: (row.moves_json as string | null) ?? null,
  };
}
