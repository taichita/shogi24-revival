import type { Piece, PieceKind, Color, Pos, Hand, DroppableKind } from './types.js';

/** 空の9x9盤面を作成 */
export function createEmptyBoard(): (Piece | null)[][] {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
}

/** 空の持ち駒を作成 */
export function createEmptyHands(): Record<Color, Hand> {
  return { black: {}, white: {} };
}

/** 盤面に駒を配置 */
export function placePiece(board: (Piece | null)[][], pos: Pos, piece: Piece): void {
  board[pos.row][pos.col] = piece;
}

/** 盤面から駒を取得 */
export function getPiece(board: (Piece | null)[][], pos: Pos): Piece | null {
  return board[pos.row][pos.col];
}

/** 位置が盤面内か判定 */
export function isOnBoard(pos: Pos): boolean {
  return pos.row >= 0 && pos.row <= 8 && pos.col >= 0 && pos.col <= 8;
}

/** 持ち駒に追加 */
export function addToHand(hand: Hand, kind: DroppableKind): void {
  hand[kind] = (hand[kind] ?? 0) + 1;
}

/** 持ち駒から消費 */
export function removeFromHand(hand: Hand, kind: DroppableKind): boolean {
  const count = hand[kind] ?? 0;
  if (count <= 0) return false;
  hand[kind] = count - 1;
  if (hand[kind] === 0) delete hand[kind];
  return true;
}

/** 持ち駒の枚数を取得 */
export function handCount(hand: Hand, kind: DroppableKind): number {
  return hand[kind] ?? 0;
}

/** 成った駒を元の駒種に戻す (取った駒を持ち駒にするとき用) */
export function unpromote(piece: Piece): DroppableKind {
  return piece.kind as DroppableKind;
}

/** 駒が成れるか判定 */
export function canPromote(kind: PieceKind): boolean {
  return kind !== 'king' && kind !== 'gold';
}

/** 成りが必須か判定 (行き先がない駒) */
export function mustPromote(kind: PieceKind, color: Color, toRow: number): boolean {
  if (color === 'black') {
    if (kind === 'pawn' || kind === 'lance') return toRow === 0;
    if (kind === 'knight') return toRow <= 1;
  } else {
    if (kind === 'pawn' || kind === 'lance') return toRow === 8;
    if (kind === 'knight') return toRow >= 7;
  }
  return false;
}

/** 成りゾーン内か判定 */
export function isPromotionZone(color: Color, row: number): boolean {
  return color === 'black' ? row <= 2 : row >= 6;
}

/** 相手の色を返す */
export function opponent(color: Color): Color {
  return color === 'black' ? 'white' : 'black';
}

/** 平手初期配置の盤面を作成 */
export function createInitialBoard(): (Piece | null)[][] {
  const board = createEmptyBoard();

  const place = (row: number, col: number, kind: PieceKind, color: Color) => {
    board[row][col] = { kind, color, promoted: false };
  };

  // 後手 (white) 陣 — row 0-2
  // 一段目 (row 0): 香 桂 銀 金 王 金 銀 桂 香
  place(0, 0, 'lance', 'white');
  place(0, 1, 'knight', 'white');
  place(0, 2, 'silver', 'white');
  place(0, 3, 'gold', 'white');
  place(0, 4, 'king', 'white');
  place(0, 5, 'gold', 'white');
  place(0, 6, 'silver', 'white');
  place(0, 7, 'knight', 'white');
  place(0, 8, 'lance', 'white');
  // 二段目 (row 1): 角(1,1) 飛(1,7)  ※SFEN順: col0=9筋
  place(1, 1, 'rook', 'white');
  place(1, 7, 'bishop', 'white');
  // 三段目 (row 2): 歩×9
  for (let c = 0; c <= 8; c++) place(2, c, 'pawn', 'white');

  // 先手 (black) 陣 — row 6-8
  // 七段目 (row 6): 歩×9
  for (let c = 0; c <= 8; c++) place(6, c, 'pawn', 'black');
  // 八段目 (row 7): 飛(7,1) 角(7,7)  ※SFEN順: col0=9筋
  place(7, 1, 'bishop', 'black');
  place(7, 7, 'rook', 'black');
  // 九段目 (row 8): 香 桂 銀 金 玉 金 銀 桂 香
  place(8, 0, 'lance', 'black');
  place(8, 1, 'knight', 'black');
  place(8, 2, 'silver', 'black');
  place(8, 3, 'gold', 'black');
  place(8, 4, 'king', 'black');
  place(8, 5, 'gold', 'black');
  place(8, 6, 'silver', 'black');
  place(8, 7, 'knight', 'black');
  place(8, 8, 'lance', 'black');

  return board;
}
