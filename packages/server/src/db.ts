import initSqlJs, { Database as SqlJsDb } from 'sql.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.resolve(DATA_DIR, 'shogi24.db');

mkdirSync(DATA_DIR, { recursive: true });

let db: SqlJsDb;

/** DB初期化（async） */
export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buf = readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      handle       TEXT UNIQUE,
      google_id    TEXT UNIQUE,
      display_name TEXT,
      avatar_url   TEXT,
      rating       INTEGER NOT NULL DEFAULT 1500,
      games        INTEGER NOT NULL DEFAULT 0,
      wins         INTEGER NOT NULL DEFAULT 0
    );
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
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // マイグレーション: 既存DBにカラムがなければ追加
  try { db.run('ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE'); } catch {}
  try { db.run('ALTER TABLE users ADD COLUMN display_name TEXT'); } catch {}
  try { db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch {}

  save();
  console.log('[db] initialized');
}

/** ディスクに保存 */
function save(): void {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
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
}

/** ハンドル名でログイン。なければ新規作成 */
export function loginOrCreate(socketId: string, handle: string, initialRating = 1500): DbUser {
  const rows = db.exec('SELECT * FROM users WHERE handle = ?', [handle]);
  if (rows.length > 0 && rows[0].values.length > 0) {
    const r = rows[0].values[0];
    // 既存ユーザー: socketIdを更新
    db.run('UPDATE users SET id = ? WHERE handle = ?', [socketId, handle]);
    save();
    return { id: socketId, handle: r[1] as string, rating: r[2] as number, games: r[3] as number, wins: r[4] as number };
  }
  db.run('INSERT INTO users (id, handle, rating, games, wins) VALUES (?, ?, ?, 0, 0)', [socketId, handle, initialRating]);
  save();
  return { id: socketId, handle, rating: initialRating, games: 0, wins: 0 };
}

/** レート更新 */
export function updateRating(userId: string, newRating: number, won: boolean): void {
  db.run('UPDATE users SET rating = ?, games = games + 1, wins = wins + ? WHERE id = ?', [newRating, won ? 1 : 0, userId]);
  save();
}

/** ユーザー取得 */
export function getUserByHandle(handle: string): DbUser | undefined {
  const rows = db.exec('SELECT * FROM users WHERE handle = ?', [handle]);
  if (rows.length === 0 || rows[0].values.length === 0) return undefined;
  const r = rows[0].values[0];
  return { id: r[0] as string, handle: r[1] as string, rating: r[2] as number, games: r[3] as number, wins: r[4] as number };
}

/** Google IDでユーザーを検索・作成 */
export function findOrCreateGoogleUser(googleId: string, displayName: string, avatarUrl?: string): DbUser {
  const rows = db.exec('SELECT * FROM users WHERE google_id = ?', [googleId]);
  if (rows.length > 0 && rows[0].values.length > 0) {
    const r = rows[0].values[0];
    // display_name / avatar を更新
    db.run('UPDATE users SET display_name = ?, avatar_url = ? WHERE google_id = ?', [displayName, avatarUrl ?? null, googleId]);
    save();
    return {
      id: r[0] as string, handle: r[1] as string | null, googleId: r[2] as string,
      displayName: r[3] as string, avatarUrl: r[4] as string,
      rating: r[5] as number, games: r[6] as number, wins: r[7] as number,
    };
  }
  // 新規作成: handleはNULL（初回ログイン時にユーザーが設定）
  const id = randomUUID();
  db.run(
    'INSERT INTO users (id, google_id, display_name, avatar_url, rating, games, wins) VALUES (?, ?, ?, ?, 1500, 0, 0)',
    [id, googleId, displayName, avatarUrl ?? null],
  );
  save();
  return { id, handle: null, googleId, displayName, avatarUrl, rating: 1500, games: 0, wins: 0 };
}

/** ハンドル名と初期レートを設定（Google認証ユーザーの初回設定） */
export function setUserHandleAndRating(userId: string, handle: string, initialRating = 1500): { ok: boolean; error?: string } {
  // 重複チェック
  const existing = db.exec('SELECT id FROM users WHERE handle = ?', [handle]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return { ok: false, error: 'このハンドル名は既に使用されています' };
  }
  // games=0のユーザーのみレートも変更可能
  db.run('UPDATE users SET handle = ?, rating = CASE WHEN games = 0 THEN ? ELSE rating END WHERE id = ?', [handle, initialRating, userId]);
  save();
  return { ok: true };
}

/** IDでユーザー取得 */
export function getUserById(userId: string): DbUser | undefined {
  const rows = db.exec('SELECT * FROM users WHERE id = ?', [userId]);
  if (rows.length === 0 || rows[0].values.length === 0) return undefined;
  const r = rows[0].values[0];
  return {
    id: r[0] as string, handle: r[1] as string, googleId: r[2] as string | undefined,
    displayName: r[3] as string | undefined, avatarUrl: r[4] as string | undefined,
    rating: r[5] as number, games: r[6] as number, wins: r[7] as number,
  };
}

// ============================================================
// 対局記録
// ============================================================

export function saveMatch(data: {
  id: string; blackId: string; whiteId: string; winnerId: string | null;
  result: string; blackRating: number; whiteRating: number;
  ratingDelta: number; timePreset: string; moves: number;
}): void {
  db.run(
    `INSERT INTO matches (id, black_id, white_id, winner_id, result, black_rating, white_rating, rating_delta, time_preset, moves)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.blackId, data.whiteId, data.winnerId, data.result,
     data.blackRating, data.whiteRating, data.ratingDelta, data.timePreset, data.moves],
  );
  save();
}
