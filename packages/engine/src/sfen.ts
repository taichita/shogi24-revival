import type { GameState, Piece, PieceKind, Color, Hand, DroppableKind } from './types.js';
import { createEmptyBoard, createEmptyHands, addToHand } from './board.js';

/** SFEN駒文字 → PieceKind */
const SFEN_TO_KIND: Record<string, PieceKind> = {
  K: 'king', R: 'rook', B: 'bishop', G: 'gold',
  S: 'silver', N: 'knight', L: 'lance', P: 'pawn',
};

/** PieceKind → SFEN駒文字 */
const KIND_TO_SFEN: Record<PieceKind, string> = {
  king: 'K', rook: 'R', bishop: 'B', gold: 'G',
  silver: 'S', knight: 'N', lance: 'L', pawn: 'P',
};

/** 平手初期局面のSFEN */
export const INITIAL_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

/** SFEN文字列からGameStateをパース */
export function parseSfen(sfen: string): GameState {
  const parts = sfen.split(' ');
  if (parts.length < 3) throw new Error(`Invalid SFEN: ${sfen}`);

  const boardStr = parts[0];
  const turnStr = parts[1];
  const handStr = parts[2];
  const moveCount = parts[3] ? parseInt(parts[3], 10) - 1 : 0;

  const board = createEmptyBoard();
  const rows = boardStr.split('/');
  if (rows.length !== 9) throw new Error(`Invalid SFEN board: ${boardStr}`);

  for (let row = 0; row < 9; row++) {
    let col = 0;
    let promoted = false;
    for (const ch of rows[row]) {
      if (ch === '+') {
        promoted = true;
        continue;
      }
      const digit = parseInt(ch, 10);
      if (!isNaN(digit)) {
        col += digit;
        promoted = false;
        continue;
      }
      const upper = ch.toUpperCase();
      const kind = SFEN_TO_KIND[upper];
      if (!kind) throw new Error(`Unknown SFEN piece: ${ch}`);
      const color: Color = ch === upper ? 'black' : 'white';
      board[row][col] = { kind, color, promoted };
      promoted = false;
      col++;
    }
  }

  const turn: Color = turnStr === 'b' ? 'black' : 'white';
  const hands = parseHands(handStr);

  return { board, hands, turn, moves: [], moveCount };
}

function parseHands(handStr: string): Record<Color, Hand> {
  const hands = createEmptyHands();
  if (handStr === '-') return hands;

  let count = 0;
  for (const ch of handStr) {
    const digit = parseInt(ch, 10);
    if (!isNaN(digit)) {
      count = count * 10 + digit;
      continue;
    }
    const upper = ch.toUpperCase();
    const kind = SFEN_TO_KIND[upper];
    if (!kind || kind === 'king') continue;
    const color: Color = ch === upper ? 'black' : 'white';
    const n = count === 0 ? 1 : count;
    for (let i = 0; i < n; i++) {
      addToHand(hands[color], kind as DroppableKind);
    }
    count = 0;
  }
  return hands;
}

/** GameStateからSFEN文字列を生成 */
export function toSfen(state: GameState): string {
  const boardStr = boardToSfen(state.board);
  const turnStr = state.turn === 'black' ? 'b' : 'w';
  const handStr = handsToSfen(state.hands);
  const moveNum = state.moveCount + 1;
  return `${boardStr} ${turnStr} ${handStr} ${moveNum}`;
}

function boardToSfen(board: (Piece | null)[][]): string {
  const rows: string[] = [];
  for (let row = 0; row < 9; row++) {
    let s = '';
    let empty = 0;
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) {
        s += empty.toString();
        empty = 0;
      }
      let ch = KIND_TO_SFEN[piece.kind];
      if (piece.color === 'white') ch = ch.toLowerCase();
      if (piece.promoted) ch = '+' + ch;
      s += ch;
    }
    if (empty > 0) s += empty.toString();
    rows.push(s);
  }
  return rows.join('/');
}

function handsToSfen(hands: Record<Color, Hand>): string {
  let s = '';
  const order: DroppableKind[] = ['rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'];

  for (const color of ['black', 'white'] as Color[]) {
    for (const kind of order) {
      const count = hands[color][kind] ?? 0;
      if (count <= 0) continue;
      if (count > 1) s += count.toString();
      let ch = KIND_TO_SFEN[kind];
      if (color === 'white') ch = ch.toLowerCase();
      s += ch;
    }
  }

  return s || '-';
}
