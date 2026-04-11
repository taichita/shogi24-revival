import type { Piece, PieceKind, Color, Pos, Move, GameState, DroppableKind } from './types.js';
import { DROPPABLE_KINDS } from './types.js';
import {
  isOnBoard, getPiece, canPromote, mustPromote, isPromotionZone, opponent,
  handCount,
} from './board.js';

// ============================================================
// 駒の移動方向定義
// ============================================================

/** 方向ベクトル [dRow, dCol] */
type Dir = [number, number];

/** 先手(black)視点の移動方向。後手は反転 */
const STEP_DIRS: Record<string, Dir[]> = {
  king:   [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
  gold:   [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,0]],
  silver: [[-1,-1],[-1,0],[-1,1],[1,-1],[1,1]],
  knight: [[-2,-1],[-2,1]],
  pawn:   [[-1,0]],
};

/** スライド(長距離移動)の方向 */
const SLIDE_DIRS: Record<string, Dir[]> = {
  rook:   [[-1,0],[1,0],[0,-1],[0,1]],
  bishop: [[-1,-1],[-1,1],[1,-1],[1,1]],
  lance:  [[-1,0]],
};

/** 成駒の移動パターン */
function getPromotedDirs(kind: PieceKind): { steps: Dir[]; slides: Dir[] } {
  switch (kind) {
    case 'rook':   // 龍 = 飛車 + 斜め1マス
      return { steps: [[-1,-1],[-1,1],[1,-1],[1,1]], slides: SLIDE_DIRS.rook };
    case 'bishop': // 馬 = 角 + 縦横1マス
      return { steps: [[-1,0],[1,0],[0,-1],[0,1]], slides: SLIDE_DIRS.bishop };
    case 'silver': // 成銀 = 金と同じ
    case 'knight': // 成桂 = 金と同じ
    case 'lance':  // 成香 = 金と同じ
    case 'pawn':   // と金 = 金と同じ
      return { steps: STEP_DIRS.gold, slides: [] };
    default:
      return { steps: [], slides: [] };
  }
}

/** 色に応じて方向を反転 */
function flipDir(dir: Dir, color: Color): Dir {
  return color === 'black' ? dir : [-dir[0] as number, -dir[1] as number] as Dir;
}

// ============================================================
// 擬似合法手生成 (王手考慮なし)
// ============================================================

/** 盤上の駒の移動候補を生成 (王手判定前) */
export function generatePseudoMoves(state: GameState, color: Color): Move[] {
  const moves: Move[] = [];
  const { board } = state;

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (!piece || piece.color !== color) continue;

      const from: Pos = { row, col };

      if (piece.promoted) {
        // 成駒の移動
        const { steps, slides } = getPromotedDirs(piece.kind);
        for (const dir of steps) {
          const d = flipDir(dir, color);
          addStepMove(board, moves, from, piece, d, color);
        }
        for (const dir of slides) {
          const d = flipDir(dir, color);
          addSlideMoves(board, moves, from, piece, d, color);
        }
      } else {
        // 通常駒のステップ移動
        const stepDirs = STEP_DIRS[piece.kind];
        if (stepDirs) {
          for (const dir of stepDirs) {
            const d = flipDir(dir, color);
            addStepMove(board, moves, from, piece, d, color);
          }
        }
        // 通常駒のスライド移動
        const slideDirs = SLIDE_DIRS[piece.kind];
        if (slideDirs) {
          for (const dir of slideDirs) {
            const d = flipDir(dir, color);
            addSlideMoves(board, moves, from, piece, d, color);
          }
        }
      }
    }
  }

  // 駒打ち
  generateDropMoves(state, color, moves);

  return moves;
}

function addStepMove(
  board: (Piece | null)[][],
  moves: Move[],
  from: Pos,
  piece: Piece,
  dir: Dir,
  color: Color,
): void {
  const to: Pos = { row: from.row + dir[0], col: from.col + dir[1] };
  if (!isOnBoard(to)) return;

  const target = getPiece(board, to);
  if (target && target.color === color) return; // 味方駒

  addMoveWithPromotion(moves, from, to, piece, target, color);
}

function addSlideMoves(
  board: (Piece | null)[][],
  moves: Move[],
  from: Pos,
  piece: Piece,
  dir: Dir,
  color: Color,
): void {
  let r = from.row + dir[0];
  let c = from.col + dir[1];

  while (r >= 0 && r <= 8 && c >= 0 && c <= 8) {
    const to: Pos = { row: r, col: c };
    const target = getPiece(board, to);

    if (target && target.color === color) break; // 味方駒でブロック

    addMoveWithPromotion(moves, from, to, piece, target, color);

    if (target) break; // 相手駒を取ったらそこまで

    r += dir[0];
    c += dir[1];
  }
}

function addMoveWithPromotion(
  moves: Move[],
  from: Pos,
  to: Pos,
  piece: Piece,
  captured: Piece | null,
  color: Color,
): void {
  const kind = piece.kind;
  const inPromZoneFrom = isPromotionZone(color, from.row);
  const inPromZoneTo = isPromotionZone(color, to.row);
  const canProm = canPromote(kind) && !piece.promoted && (inPromZoneFrom || inPromZoneTo);
  const mustProm = mustPromote(kind, color, to.row);

  if (canProm) {
    // 成る手
    moves.push({
      type: 'move', from, to, pieceKind: kind,
      promote: true,
      captured: captured ?? undefined,
    });
  }

  if (!mustProm) {
    // 成らない手 (成り必須でなければ)
    moves.push({
      type: 'move', from, to, pieceKind: kind,
      promote: false,
      captured: captured ?? undefined,
    });
  }
}

// ============================================================
// 駒打ち生成
// ============================================================

function generateDropMoves(state: GameState, color: Color, moves: Move[]): void {
  const hand = state.hands[color];
  const { board } = state;

  for (const kind of DROPPABLE_KINDS) {
    if (handCount(hand, kind) <= 0) continue;

    // 歩の二歩チェック用: 各列に未成の味方歩があるか
    const pawnCols = kind === 'pawn' ? getPawnColumns(board, color) : new Set<number>();

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col]) continue; // 空きマスのみ

        // 行き場のない駒は打てない
        if (mustPromote(kind, color, row)) continue;

        // 二歩禁止
        if (kind === 'pawn' && pawnCols.has(col)) continue;

        moves.push({
          type: 'drop', to: { row, col }, pieceKind: kind,
        });
      }
    }
  }
}

/** 指定色の未成歩がある列のセットを返す */
function getPawnColumns(board: (Piece | null)[][], color: Color): Set<number> {
  const cols = new Set<number>();
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const p = board[row][col];
      if (p && p.kind === 'pawn' && !p.promoted && p.color === color) {
        cols.add(col);
      }
    }
  }
  return cols;
}

// ============================================================
// 王手・合法手判定
// ============================================================

/** 指定位置が敵に攻撃されているか */
export function isAttackedBy(board: (Piece | null)[][], pos: Pos, attacker: Color): boolean {
  // 全マスの攻撃側の駒から、posに到達できるか調べる
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (!piece || piece.color !== attacker) continue;

      if (canReach(board, { row, col }, pos, piece, attacker)) {
        return true;
      }
    }
  }
  return false;
}

/** 駒がfromからtoに到達できるか */
function canReach(
  board: (Piece | null)[][],
  from: Pos,
  to: Pos,
  piece: Piece,
  color: Color,
): boolean {
  if (piece.promoted) {
    const { steps, slides } = getPromotedDirs(piece.kind);
    for (const dir of steps) {
      const d = flipDir(dir, color);
      if (from.row + d[0] === to.row && from.col + d[1] === to.col) return true;
    }
    for (const dir of slides) {
      const d = flipDir(dir, color);
      if (canSlideReach(board, from, to, d)) return true;
    }
  } else {
    const stepDirs = STEP_DIRS[piece.kind];
    if (stepDirs) {
      for (const dir of stepDirs) {
        const d = flipDir(dir, color);
        if (from.row + d[0] === to.row && from.col + d[1] === to.col) return true;
      }
    }
    const slideDirs = SLIDE_DIRS[piece.kind];
    if (slideDirs) {
      for (const dir of slideDirs) {
        const d = flipDir(dir, color);
        if (canSlideReach(board, from, to, d)) return true;
      }
    }
  }
  return false;
}

function canSlideReach(board: (Piece | null)[][], from: Pos, to: Pos, dir: Dir): boolean {
  let r = from.row + dir[0];
  let c = from.col + dir[1];
  while (r >= 0 && r <= 8 && c >= 0 && c <= 8) {
    if (r === to.row && c === to.col) return true;
    if (board[r][c]) return false; // 途中に駒があれば到達不能
    r += dir[0];
    c += dir[1];
  }
  return false;
}

/** 玉の位置を探す */
export function findKing(board: (Piece | null)[][], color: Color): Pos | null {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const p = board[row][col];
      if (p && p.kind === 'king' && p.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

/** 王手されているか */
export function isInCheck(board: (Piece | null)[][], color: Color): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  return isAttackedBy(board, kingPos, opponent(color));
}
