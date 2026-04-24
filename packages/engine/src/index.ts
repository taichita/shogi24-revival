export type {
  Color, PieceKind, Piece, Pos, Move, Hand, DroppableKind,
  GameState, GameResult, ResultReason,
} from './types.js';

export {
  PIECE_KANJI, PROMOTED_KANJI, ALL_PIECE_KINDS, DROPPABLE_KINDS,
} from './types.js';

export {
  createEmptyBoard, createEmptyHands, createInitialBoard,
  placePiece, getPiece, isOnBoard,
  addToHand, removeFromHand, handCount,
  canPromote, mustPromote, isPromotionZone, opponent,
} from './board.js';

export {
  generatePseudoMoves, isAttackedBy, findKing, isInCheck,
} from './moves.js';

export {
  createGame, generateLegalMoves, getLegalMovesFrom, getLegalMovesTo, getLegalDrops,
  makeMove, isCheckmate, isStalemate, isCheck, movesEqual, moveToJapanese,
} from './game.js';

export {
  parseSfen, toSfen, INITIAL_SFEN,
} from './sfen.js';

export type { RatingResult } from './rating.js';
export { calc24Exchange, apply24Rating } from './rating.js';

export { ratingToRank, getSelectableRanks, isValidInitialRating } from './rank.js';

export type { KifMeta } from './kif.js';
export { moveToKif, movesToKif, computePromotedBefore, toKifString } from './kif.js';
