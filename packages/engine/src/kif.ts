/**
 * KIF形式（柿木将棋互換）の棋譜エクスポーター
 *
 * 仕様（代表的な規約）：
 *   - ヘッダ行は `項目：値`（全角コロン）
 *   - 手数は3桁右寄せ、半角スペース1つ、指し手
 *   - 筋は全角数字（９...１）、段は漢数字（一...九）
 *   - 駒打ち: 指し手末尾に `打`（座標の () は付けない）
 *   - 成り: 駒名の後に `成`、不成: `不成`
 *   - 同一マスへの連続指しは `同　〇〇` （全角スペース）
 *   - 移動元は `(筋段)` の算用数字2桁（例: 77 = 7七）
 *   - 最後に `まで○○手で△△の勝ち` を付ける
 */

import type { Move, Color, PieceKind, GameResult, GameState } from './types.js';
import { createGame } from './game.js';
import { makeMove } from './game.js';

const FULL_WIDTH_COL = ['９', '８', '７', '６', '５', '４', '３', '２', '１'];
const KANJI_ROW = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 成駒は1枚形で表現する将棋ソフトが多いので、それに合わせる
const PIECE_NAME: Record<PieceKind, string> = {
  king:   '玉',
  rook:   '飛',
  bishop: '角',
  gold:   '金',
  silver: '銀',
  knight: '桂',
  lance:  '香',
  pawn:   '歩',
};

const PROMOTED_NAME: Partial<Record<PieceKind, string>> = {
  rook:   '龍',
  bishop: '馬',
  silver: '成銀',
  knight: '成桂',
  lance:  '成香',
  pawn:   'と',
};

function pad3(n: number): string {
  const s = String(n);
  return s.length >= 3 ? s : ' '.repeat(3 - s.length) + s;
}

function kifSquareFromPos(col: number, row: number): string {
  // 筋: 右から1..9 → col=8→1, col=0→9
  const suji = 9 - col;
  // 段: 上から1..9 → row=0→1, row=8→9
  const dan = row + 1;
  return `${suji}${dan}`;
}

/**
 * 1手を KIF 文字列化
 * @param move  指し手
 * @param prev  直前の手（`同` 判定用、なければundefined）
 * @param prevBoardPromoted  移動元の駒が既に成駒だったか（成り駒の場合の名称判定用）
 */
export function moveToKif(
  move: Move,
  prev?: Move,
  prevBoardPromoted?: boolean,
): string {
  // 行き先
  const same = prev && prev.to.row === move.to.row && prev.to.col === move.to.col;
  const toStr = same
    ? '同　'
    : `${FULL_WIDTH_COL[move.to.col]}${KANJI_ROW[move.to.row]}`;

  // 駒名：既に成駒だったら成駒名、そうでなく `move.promote=true` は『成』サフィックスのみ
  let name = PIECE_NAME[move.pieceKind];
  if (prevBoardPromoted && move.type === 'move') {
    name = PROMOTED_NAME[move.pieceKind] ?? name;
  }

  if (move.type === 'drop') {
    return `${toStr}${name}打`;
  }

  const suffix = move.promote ? '成' : '';
  const fromStr = move.from ? `(${kifSquareFromPos(move.from.col, move.from.row)})` : '';
  return `${toStr}${name}${suffix}${fromStr}`;
}

export interface KifMeta {
  blackName?: string;
  whiteName?: string;
  startDate?: string;    // 例: "2024/01/02 12:34:56"
  endDate?: string;
  handicap?: string;     // 手合割。省略時「平手」
  siteName?: string;
  timePreset?: string;
  result?: GameResult | null;
  moveCount?: number;    // 残余（表示用）
}

/** 結果を KIF の「まで○○手で△△の勝ち」または最終手後の結果行に変換 */
function resultLine(totalMoves: number, result: GameResult | undefined | null, lastMover: Color | null): string {
  if (!result) return '';
  const reasonMap: Record<string, string> = {
    checkmate: '詰み',
    resign: '投了',
    timeout: '切れ負け',
    disconnect: '切断',
    illegal_move: '反則',
    repetition: '千日手',
    perpetual_check: '連続王手千日手',
    impasse: '入玉勝ち',
  };
  if (result.winner === null) {
    return `まで${totalMoves}手で持将棋（${reasonMap[result.reason] ?? result.reason}）`;
  }
  const winnerName = result.winner === 'black' ? '先手' : '後手';
  return `まで${totalMoves}手で${winnerName}の勝ち（${reasonMap[result.reason] ?? result.reason}）`;
}

/**
 * 指し手列と駒情報から KIF 全文を生成する。
 *
 * 注意: 成駒の名称を出し分けるため、`promotedBefore[i]` として i手目の「動かす駒が既に成駒だったか」を渡せる。
 * 不明ならundefinedでOK（その場合は元駒名で出す）。
 */
export function movesToKif(
  moves: Move[],
  meta: KifMeta = {},
  promotedBefore?: boolean[],
): string {
  const lines: string[] = [];
  lines.push('# ----  R24将棋道場 棋譜  ----');
  if (meta.startDate) lines.push(`開始日時：${meta.startDate}`);
  if (meta.endDate) lines.push(`終了日時：${meta.endDate}`);
  if (meta.siteName) lines.push(`場所：${meta.siteName}`);
  if (meta.timePreset) lines.push(`持ち時間：${meta.timePreset}`);
  lines.push(`手合割：${meta.handicap ?? '平手'}`);
  lines.push(`先手：${meta.blackName ?? '先手'}`);
  lines.push(`後手：${meta.whiteName ?? '後手'}`);
  lines.push('手数----指手---------消費時間--');

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const prev = i > 0 ? moves[i - 1] : undefined;
    const promoted = promotedBefore?.[i];
    const str = moveToKif(m, prev, promoted);
    lines.push(`${pad3(i + 1)} ${str}`);
  }

  if (meta.result) {
    const lastMover: Color | null = moves.length > 0
      ? (moves.length % 2 === 1 ? 'black' : 'white')
      : null;
    const resLine = resultLine(moves.length, meta.result, lastMover);
    if (resLine) lines.push(resLine);
  }

  return lines.join('\n') + '\n';
}

/**
 * moves を初期局面から再生しつつ、各手の「動かす駒が既に成駒だったか」を記録したフラグ配列を返す。
 * これを `movesToKif` の `promotedBefore` に渡すと成駒名（龍・馬・と等）が正しく出る。
 */
export function computePromotedBefore(moves: Move[]): boolean[] {
  const flags: boolean[] = [];
  let state: GameState = createGame();
  for (const m of moves) {
    if (m.type === 'move' && m.from) {
      const p = state.board[m.from.row][m.from.col];
      flags.push(!!p?.promoted);
    } else {
      flags.push(false);
    }
    try { state = makeMove(state, m); } catch { break; }
  }
  return flags;
}

/** 便利ラッパ: moves + meta だけ渡せば KIF 文字列を得る */
export function toKifString(moves: Move[], meta: KifMeta = {}): string {
  return movesToKif(moves, meta, computePromotedBefore(moves));
}

