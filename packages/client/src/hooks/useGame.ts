"use client";

import { useState, useCallback, useMemo } from "react";
import type { GameState, Move, Pos, DroppableKind } from "@shogi24/engine";
import {
  createGame,
  generateLegalMoves,
  getLegalMovesFrom,
  getLegalDrops,
  makeMove,
  isCheckmate,
  isCheck,
  moveToJapanese,
} from "@shogi24/engine";

export type SelectionState =
  | { type: "none" }
  | { type: "piece"; from: Pos; moves: Move[] }
  | { type: "drop"; kind: DroppableKind; moves: Move[] };

export interface UseGameReturn {
  game: GameState;
  selection: SelectionState;
  moveHistory: string[];
  status: string;
  selectCell: (pos: Pos) => void;
  selectHandPiece: (kind: DroppableKind) => void;
  clearSelection: () => void;
  confirmPromotion: (promote: boolean) => void;
  promotionPending: PromotionChoice | null;
  resign: () => void;
  reset: () => void;
}

interface PromotionChoice {
  promoteMove: Move;
  noPromoteMove: Move;
}

export function useGame(): UseGameReturn {
  const [game, setGame] = useState<GameState>(createGame);
  const [selection, setSelection] = useState<SelectionState>({ type: "none" });
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [promotionPending, setPromotionPending] = useState<PromotionChoice | null>(null);

  const legalMoves = useMemo(() => generateLegalMoves(game), [game]);

  const status = useMemo(() => {
    if (game.result) {
      if (game.result.winner === null) return "引き分け";
      const w = game.result.winner === "black" ? "先手" : "後手";
      const reasons: Record<string, string> = {
        checkmate: "詰み", resign: "投了", timeout: "時間切れ",
        illegal_move: "反則", repetition: "千日手",
        perpetual_check: "連続王手千日手", impasse: "持将棋",
        disconnect: "切断",
      };
      return `${w}の勝ち（${reasons[game.result.reason] ?? game.result.reason}）`;
    }
    const turnLabel = game.turn === "black" ? "先手" : "後手";
    if (isCheckmate(game)) return `${turnLabel}の負け（詰み）`;
    if (isCheck(game)) return `${turnLabel}番 — 王手！`;
    return `${turnLabel}番`;
  }, [game]);

  const executeMove = useCallback(
    (move: Move) => {
      const label = `${game.moveCount + 1}. ${moveToJapanese(move, game.turn)}`;
      try {
        const next = makeMove(game, move);
        setGame(next);
        setMoveHistory((h) => [...h, label]);
        setSelection({ type: "none" });
      } catch {
        // illegal — ignore
      }
    },
    [game],
  );

  const selectCell = useCallback(
    (pos: Pos) => {
      if (game.result) return;
      if (promotionPending) return;

      const piece = game.board[pos.row][pos.col];

      // 合法手先のマスをクリック → 着手
      if (selection.type === "piece" || selection.type === "drop") {
        const matching = selection.moves.filter(
          (m) => m.to.row === pos.row && m.to.col === pos.col,
        );
        if (matching.length === 1) {
          executeMove(matching[0]);
          return;
        }
        if (matching.length === 2) {
          // 成り/不成の選択
          const promMove = matching.find((m) => m.promote)!;
          const noPromMove = matching.find((m) => !m.promote)!;
          setPromotionPending({ promoteMove: promMove, noPromoteMove: noPromMove });
          return;
        }
      }

      // 自分の駒を選択
      if (piece && piece.color === game.turn) {
        const moves = getLegalMovesFrom(game, pos);
        setSelection({ type: "piece", from: pos, moves });
        return;
      }

      // 何もないマスクリック → 選択解除
      setSelection({ type: "none" });
    },
    [game, selection, promotionPending, executeMove],
  );

  const selectHandPiece = useCallback(
    (kind: DroppableKind) => {
      if (game.result) return;
      if (promotionPending) return;
      const drops = getLegalDrops(game, kind);
      if (drops.length === 0) return;
      setSelection({ type: "drop", kind, moves: drops });
    },
    [game, promotionPending],
  );

  const clearSelection = useCallback(() => {
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, []);

  const confirmPromotion = useCallback(
    (promote: boolean) => {
      if (!promotionPending) return;
      executeMove(promote ? promotionPending.promoteMove : promotionPending.noPromoteMove);
      setPromotionPending(null);
    },
    [promotionPending, executeMove],
  );

  const resign = useCallback(() => {
    if (game.result) return;
    const winner = game.turn === "black" ? "white" : "black";
    setGame((g) => ({
      ...g,
      result: { winner, reason: "resign" },
    }));
  }, [game]);

  const reset = useCallback(() => {
    setGame(createGame());
    setSelection({ type: "none" });
    setMoveHistory([]);
    setPromotionPending(null);
  }, []);

  return {
    game, selection, moveHistory, status,
    selectCell, selectHandPiece, clearSelection,
    confirmPromotion, promotionPending,
    resign, reset,
  };
}
