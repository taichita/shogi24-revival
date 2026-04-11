import type { Piece } from "@shogi24/engine";

/** 駒の表示文字を返す */
export function pieceLabel(piece: Piece): string {
  if (piece.promoted) {
    const promoted: Record<string, string> = {
      rook: '龍', bishop: '馬', silver: '全', knight: '圭', lance: '杏', pawn: 'と',
    };
    return promoted[piece.kind] ?? piece.kind;
  }
  const base: Record<string, string> = {
    king: piece.color === 'black' ? '玉' : '王',
    rook: '飛', bishop: '角', gold: '金', silver: '銀',
    knight: '桂', lance: '香', pawn: '歩',
  };
  return base[piece.kind] ?? piece.kind;
}

/** 持ち駒の表示文字を返す */
export function handPieceLabel(kind: string): string {
  const labels: Record<string, string> = {
    rook: '飛', bishop: '角', gold: '金', silver: '銀',
    knight: '桂', lance: '香', pawn: '歩',
  };
  return labels[kind] ?? kind;
}
