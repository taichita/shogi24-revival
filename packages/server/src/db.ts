import initSqlJs, { Database as SqlJsDb } from 'sql.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

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
      id         TEXT PRIMARY KEY,
      handle     TEXT NOT NULL UNIQUE,
      rating     INTEGER NOT NULL DEFAULT 1500,
      games      INTEGER NOT NULL DEFAULT 0,
      wins       INTEGER NOT NULL DEFAULT 0
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
  handle: string;
  rating: number;
  games: number;
  wins: number;
}

/** ハンドル名でログイン。なければ新規作成 */
export function loginOrCreate(socketId: string, handle: string): DbUser {
  const rows = db.exec('SELECT * FROM users WHERE handle = ?', [handle]);
  if (rows.length > 0 && rows[0].values.length > 0) {
    const r = rows[0].values[0];
    // 既存ユーザー: socketIdを更新
    db.run('UPDATE users SET id = ? WHERE handle = ?', [socketId, handle]);
    save();
    return { id: socketId, handle: r[1] as string, rating: r[2] as number, games: r[3] as number, wins: r[4] as number };
  }
  db.run('INSERT INTO users (id, handle, rating, games, wins) VALUES (?, ?, 1500, 0, 0)', [socketId, handle]);
  save();
  return { id: socketId, handle, rating: 1500, games: 0, wins: 0 };
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
