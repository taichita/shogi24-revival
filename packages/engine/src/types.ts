/** 先手(black/sente) or 後手(white/gote) */
export type Color = 'black' | 'white';

/** 基本駒種 */
export type PieceKind =
  | 'king'    // 玉/王
  | 'rook'    // 飛
  | 'bishop'  // 角
  | 'gold'    // 金
  | 'silver'  // 銀
  | 'knight'  // 桂
  | 'lance'   // 香
  | 'pawn';   // 歩

/** 盤上の駒 */
export interface Piece {
  kind: PieceKind;
  color: Color;
  promoted: boolean;
}

/** 盤上の位置 (0-indexed: row 0=一段目(白側), row 8=九段目(黒側)) */
export interface Pos {
  row: number; // 0-8
  col: number; // 0-8
}

/** 指し手 */
export interface Move {
  type: 'move' | 'drop';
  /** 移動元 (dropの場合undefined) */
  from?: Pos;
  /** 移動先 */
  to: Pos;
  /** 駒種 */
  pieceKind: PieceKind;
  /** 成るかどうか */
  promote?: boolean;
  /** 取った駒 (エンジンが設定) */
  captured?: Piece;
}

/** 持ち駒 (駒種 → 枚数) */
export type Hand = Partial<Record<DroppableKind, number>>;

/** 打てる駒種 (玉以外) */
export type DroppableKind = Exclude<PieceKind, 'king'>;

/** ゲームの状態 */
export interface GameState {
  /** 9x9盤面 board[row][col] */
  board: (Piece | null)[][];
  /** 持ち駒 */
  hands: Record<Color, Hand>;
  /** 手番 */
  turn: Color;
  /** 棋譜 */
  moves: Move[];
  /** 手数 */
  moveCount: number;
  /** 終局結果 */
  result?: GameResult;
}

export interface GameResult {
  winner: Color | null; // null = 引き分け
  reason: ResultReason;
}

export type ResultReason =
  | 'checkmate'       // 詰み
  | 'resign'          // 投了
  | 'timeout'         // 時間切れ
  | 'illegal_move'    // 反則負け
  | 'repetition'      // 千日手
  | 'perpetual_check' // 連続王手千日手
  | 'impasse'         // 持将棋(入玉宣言)
  | 'disconnect';     // 切断

/** 駒の日本語表示 */
export const PIECE_KANJI: Record<PieceKind, [string, string]> = {
  king:   ['玉', '王'],  // [先手, 後手]
  rook:   ['飛', '飛'],
  bishop: ['角', '角'],
  gold:   ['金', '金'],
  silver: ['銀', '銀'],
  knight: ['桂', '桂'],
  lance:  ['香', '香'],
  pawn:   ['歩', '歩'],
};

/** 成駒の日本語表示 */
export const PROMOTED_KANJI: Partial<Record<PieceKind, string>> = {
  rook:   '龍',
  bishop: '馬',
  silver: '成銀',
  knight: '成桂',
  lance:  '成香',
  pawn:   'と',
};

/** 駒種の全リスト */
export const ALL_PIECE_KINDS: PieceKind[] = [
  'king', 'rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn',
];

/** 打てる駒種リスト */
export const DROPPABLE_KINDS: DroppableKind[] = [
  'rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn',
];
