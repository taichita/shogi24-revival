import type { GameState, Move, Color, Pos, Piece, DroppableKind } from './types.js';
import {
  createInitialBoard, createEmptyHands, getPiece, addToHand, removeFromHand,
  opponent, unpromote,
} from './board.js';
import { generatePseudoMoves, isInCheck, findKing, isAttackedBy } from './moves.js';

// ============================================================
// ゲーム作成
// ============================================================

/** 平手の初期局面を作成 */
export function createGame(): GameState {
  return {
    board: createInitialBoard(),
    hands: createEmptyHands(),
    turn: 'black',
    moves: [],
    moveCount: 0,
  };
}

// ============================================================
// 合法手生成
// ============================================================

/** 合法手を全て生成 (王手回避・自殺手排除含む) */
export function generateLegalMoves(state: GameState): Move[] {
  const pseudo = generatePseudoMoves(state, state.turn);
  const legal: Move[] = [];

  for (const move of pseudo) {
    // 試しに指して、自玉が王手されないか確認
    const next = applyMoveUnchecked(state, move);
    if (!isInCheck(next.board, state.turn)) {
      // 打ち歩詰めチェック
      if (move.type === 'drop' && move.pieceKind === 'pawn') {
        if (isCheckmate(next)) {
          continue; // 打ち歩詰め → 禁止
        }
      }
      legal.push(move);
    }
  }

  return legal;
}

/** 指定マスに移動/打てる合法手 */
export function getLegalMovesTo(state: GameState, to: Pos): Move[] {
  return generateLegalMoves(state).filter(
    m => m.to.row === to.row && m.to.col === to.col
  );
}

/** 指定マスから動ける合法手 */
export function getLegalMovesFrom(state: GameState, from: Pos): Move[] {
  return generateLegalMoves(state).filter(
    m => m.type === 'move' && m.from!.row === from.row && m.from!.col === from.col
  );
}

/** 指定駒種を打てるマスの合法手 */
export function getLegalDrops(state: GameState, kind: DroppableKind): Move[] {
  return generateLegalMoves(state).filter(
    m => m.type === 'drop' && m.pieceKind === kind
  );
}

// ============================================================
// 着手実行
// ============================================================

/** 着手を実行して新しい状態を返す (不変操作) */
export function makeMove(state: GameState, move: Move): GameState {
  // 合法性チェック
  const legal = generateLegalMoves(state);
  const found = legal.find(m => movesEqual(m, move));
  if (!found) {
    throw new Error(`Illegal move: ${JSON.stringify(move)}`);
  }

  return applyMoveUnchecked(state, found);
}

/** 合法性チェックなしで着手を適用 (内部用) */
function applyMoveUnchecked(state: GameState, move: Move): GameState {
  // deep copy
  const board = state.board.map(row => row.map(cell => cell ? { ...cell } : null));
  const hands: GameState['hands'] = {
    black: { ...state.hands.black },
    white: { ...state.hands.white },
  };

  if (move.type === 'move') {
    const from = move.from!;
    const piece = board[from.row][from.col]!;

    // 取った駒を持ち駒に
    const captured = board[move.to.row][move.to.col];
    if (captured) {
      const dropKind = unpromote(captured);
      addToHand(hands[state.turn], dropKind);
    }

    // 移動
    board[from.row][from.col] = null;
    board[move.to.row][move.to.col] = {
      kind: piece.kind,
      color: piece.color,
      promoted: move.promote ? true : piece.promoted,
    };
  } else {
    // 駒打ち
    removeFromHand(hands[state.turn], move.pieceKind as DroppableKind);
    board[move.to.row][move.to.col] = {
      kind: move.pieceKind,
      color: state.turn,
      promoted: false,
    };
  }

  return {
    board,
    hands,
    turn: opponent(state.turn),
    moves: [...state.moves, { ...move, captured: move.type === 'move' ? (getPiece(state.board, move.to) ?? undefined) : undefined }],
    moveCount: state.moveCount + 1,
  };
}

// ============================================================
// 終局判定
// ============================================================

/** 詰みか判定 */
export function isCheckmate(state: GameState): boolean {
  if (!isInCheck(state.board, state.turn)) return false;
  const legal = generateLegalMovesForCheckmate(state);
  return legal.length === 0;
}

/** ステイルメイト判定 (将棋では通常起きないが安全のため) */
export function isStalemate(state: GameState): boolean {
  if (isInCheck(state.board, state.turn)) return false;
  const legal = generateLegalMovesForCheckmate(state);
  return legal.length === 0;
}

/** 詰み判定用: 打ち歩詰めチェックなしの合法手生成 */
function generateLegalMovesForCheckmate(state: GameState): Move[] {
  const pseudo = generatePseudoMoves(state, state.turn);
  const legal: Move[] = [];
  for (const move of pseudo) {
    const next = applyMoveUnchecked(state, move);
    if (!isInCheck(next.board, state.turn)) {
      legal.push(move);
    }
  }
  return legal;
}

/** 王手か判定 (現在の手番の王が王手されているか) */
export function isCheck(state: GameState): boolean {
  return isInCheck(state.board, state.turn);
}

// ============================================================
// ユーティリティ
// ============================================================

/** 2つの指し手が同じか比較 */
export function movesEqual(a: Move, b: Move): boolean {
  if (a.type !== b.type) return false;
  if (a.to.row !== b.to.row || a.to.col !== b.to.col) return false;
  if (a.pieceKind !== b.pieceKind) return false;
  if (a.type === 'move') {
    if (!a.from || !b.from) return false;
    if (a.from.row !== b.from.row || a.from.col !== b.from.col) return false;
    if (!!a.promote !== !!b.promote) return false;
  }
  return true;
}

/** 棋譜の手を日本語表記に変換 */
export function moveToJapanese(move: Move, color: Color): string {
  const colNames = ['９', '８', '７', '６', '５', '４', '３', '２', '１'];
  const rowNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const kindNames: Record<string, string> = {
    king: '玉', rook: '飛', bishop: '角', gold: '金',
    silver: '銀', knight: '桂', lance: '香', pawn: '歩',
  };

  const toStr = `${colNames[move.to.col]}${rowNames[move.to.row]}`;
  const kindStr = kindNames[move.pieceKind] ?? move.pieceKind;

  if (move.type === 'drop') {
    return `${toStr}${kindStr}打`;
  }

  const promStr = move.promote ? '成' : '';
  return `${toStr}${kindStr}${promStr}`;
}
