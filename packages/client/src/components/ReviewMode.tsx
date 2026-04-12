"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Move, Pos, DroppableKind, Color, GameState } from "@shogi24/engine";
import {
  getLegalMovesFrom, getLegalDrops, makeMove as engineMakeMove,
  moveToJapanese, createGame,
} from "@shogi24/engine";
import { ShogiBoard } from "./ShogiBoard";
import { HandPieces } from "./HandPieces";
import { PromotionDialog } from "./PromotionDialog";
import { ChatPanel, type ChatMessage } from "./ChatPanel";

type SelectionState =
  | { type: "none" }
  | { type: "piece"; from: Pos; moves: Move[] }
  | { type: "drop"; kind: DroppableKind; moves: Move[] };

interface PromotionChoice { promoteMove: Move; noPromoteMove: Move; }

interface Props {
  myColor: Color;
  myBoard: GameState | null;
  opponentBoard: GameState | null;
  onReviewMove: (move: Move) => void;
  onUndo: () => void;
  onReset: (position: "initial" | "final") => void;
  onLeave: () => void;
  onBackToLobby: () => void;
  chatMessages: ChatMessage[];
  onSendChat: (message: string) => void;
  myHandle: string | null;
  blackHandle: string;
  whiteHandle: string;
}

/** 手のリストからn手目までの局面を再現する */
function replayToMove(moves: Move[], targetIndex: number): GameState {
  let state = createGame();
  for (let i = 0; i <= targetIndex && i < moves.length; i++) {
    try { state = engineMakeMove(state, moves[i]); } catch { break; }
  }
  return state;
}

export function ReviewMode({
  myColor, myBoard, opponentBoard,
  onReviewMove, onUndo, onReset, onLeave, onBackToLobby,
  chatMessages, onSendChat, myHandle,
  blackHandle, whiteHandle,
}: Props) {
  // 対局の全手記録（感想戦の基本データ）
  const allMoves = useMemo(() => myBoard?.moves ?? [], [myBoard]);
  const totalMoves = allMoves.length;

  // 現在表示中の手数（-1=初期局面、0=1手目、...、totalMoves-1=最終局面）
  const [currentMoveIndex, setCurrentMoveIndex] = useState(totalMoves - 1);
  // 感想戦で追加で動かした手
  const [extraMoves, setExtraMoves] = useState<GameState[]>([]);

  const [selection, setSelection] = useState<SelectionState>({ type: "none" });
  const [promotionPending, setPromotionPending] = useState<PromotionChoice | null>(null);
  const flipped = myColor === "white";

  // 現在の盤面を計算
  const displayBoard = useMemo(() => {
    if (extraMoves.length > 0) return extraMoves[extraMoves.length - 1];
    if (currentMoveIndex < 0) return createGame();
    return replayToMove(allMoves, currentMoveIndex);
  }, [allMoves, currentMoveIndex, extraMoves]);

  // 棋譜表示用
  const moveHistory = useMemo(() => {
    return allMoves.map((m, i) => {
      const color: Color = i % 2 === 0 ? "black" : "white";
      return `${i + 1}. ${moveToJapanese(m, color)}`;
    });
  }, [allMoves]);

  // 局面移動関数
  const goToMove = useCallback((index: number) => {
    setCurrentMoveIndex(Math.max(-1, Math.min(totalMoves - 1, index)));
    setExtraMoves([]);
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [totalMoves]);

  const goToStart = () => goToMove(-1);
  const goBack10 = () => goToMove(currentMoveIndex - 10);
  const goBack1 = () => {
    if (extraMoves.length > 0) {
      setExtraMoves((prev) => prev.slice(0, -1));
    } else {
      goToMove(currentMoveIndex - 1);
    }
  };
  const goForward1 = () => goToMove(currentMoveIndex + 1);
  const goForward10 = () => goToMove(currentMoveIndex + 10);
  const goToEnd = () => goToMove(totalMoves - 1);

  // 感想戦での着手（手番制限なし）
  const executeMove = useCallback((move: Move) => {
    if (!displayBoard) return;
    try {
      const newBoard = engineMakeMove(displayBoard, move);
      setExtraMoves((prev) => [...prev, newBoard]);
    } catch { /* invalid move */ }
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [displayBoard]);

  // 感想戦では手番の駒だけでなくどちらの駒も選択可能
  const selectCell = useCallback((pos: Pos) => {
    if (!displayBoard || promotionPending) return;

    if (selection.type === "piece" || selection.type === "drop") {
      const matching = selection.moves.filter(
        (m) => m.to.row === pos.row && m.to.col === pos.col,
      );
      if (matching.length === 1) { executeMove(matching[0]); return; }
      if (matching.length === 2) {
        setPromotionPending({
          promoteMove: matching.find((m) => m.promote)!,
          noPromoteMove: matching.find((m) => !m.promote)!,
        });
        return;
      }
    }

    // 手番の駒を選択（感想戦では現在の手番の駒のみ動かせる）
    const piece = displayBoard.board[pos.row][pos.col];
    if (piece && piece.color === displayBoard.turn) {
      setSelection({ type: "piece", from: pos, moves: getLegalMovesFrom(displayBoard, pos) });
      return;
    }
    setSelection({ type: "none" });
  }, [displayBoard, selection, promotionPending, executeMove]);

  // 持ち駒選択（感想戦では手番側の持ち駒を使える）
  const selectHandPiece = useCallback((kind: DroppableKind) => {
    if (!displayBoard) return;
    const drops = getLegalDrops(displayBoard, kind);
    if (drops.length > 0) setSelection({ type: "drop", kind, moves: drops });
  }, [displayBoard]);

  const confirmPromotion = useCallback((promote: boolean) => {
    if (!promotionPending) return;
    executeMove(promote ? promotionPending.promoteMove : promotionPending.noPromoteMove);
  }, [promotionPending, executeMove]);

  if (!displayBoard) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ fontSize: 16, marginBottom: 16 }}>ボードを読み込み中...</p>
        <button onClick={onBackToLobby} style={btnStyleDark}>ロビーに戻る</button>
      </div>
    );
  }

  const topColor: Color = flipped ? "black" : "white";
  const botColor: Color = flipped ? "white" : "black";
  const lastMove = displayBoard.moves.length > 0 ? displayBoard.moves[displayBoard.moves.length - 1] : undefined;

  const isTopTurn = displayBoard.turn === topColor;
  const isBotTurn = displayBoard.turn === botColor;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: "bold", color: "#d97706" }}>
        感想戦 — {extraMoves.length > 0 ? "変化手順" : `${currentMoveIndex + 1}手目 / ${totalMoves}手`}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* 左: 棋譜 + ナビ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 180, height: 520 }}>
          {/* 棋譜（クリックでジャンプ） */}
          <div style={{
            flex: 1, overflowY: "auto", backgroundColor: "#fafaf9",
            border: "1px solid #d6d3d1", borderRadius: 8, padding: 8,
          }}>
            {moveHistory.map((m, i) => (
              <div
                key={i}
                onClick={() => goToMove(i)}
                style={{
                  padding: "2px 4px", borderRadius: 4, fontSize: 13, fontFamily: "monospace",
                  cursor: "pointer",
                  backgroundColor: i === currentMoveIndex && extraMoves.length === 0 ? "#fef3c7" : "transparent",
                  fontWeight: i === currentMoveIndex && extraMoves.length === 0 ? "bold" : "normal",
                }}
              >
                {m}
              </div>
            ))}
          </div>

          {/* ナビゲーションボタン */}
          <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
            <NavBtn label="⏮" title="初手に戻る" onClick={goToStart} />
            <NavBtn label="⏪" title="10手戻る" onClick={goBack10} />
            <NavBtn label="◀" title="1手戻る" onClick={goBack1} />
            <NavBtn label="▶" title="1手進む" onClick={goForward1} />
            <NavBtn label="⏩" title="10手進む" onClick={goForward10} />
            <NavBtn label="⏭" title="最終手に進む" onClick={goToEnd} />
          </div>

          {/* チャット */}
          <ChatPanel messages={chatMessages} onSend={onSendChat} myHandle={myHandle} />
        </div>

        {/* 中央: 盤面 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {topColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
          </div>
          <HandPieces
            hand={displayBoard.hands[topColor]}
            color={topColor}
            isActive={isTopTurn}
            selection={selection}
            onSelect={selectHandPiece}
            flipped={flipped}
          />
          <ShogiBoard
            board={displayBoard.board}
            selection={selection}
            onCellClick={selectCell}
            lastMove={lastMove}
            flipped={flipped}
          />
          <HandPieces
            hand={displayBoard.hands[botColor]}
            color={botColor}
            isActive={isBotTurn}
            selection={selection}
            onSelect={selectHandPiece}
            flipped={flipped}
          />
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {botColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
          </div>
        </div>

        {/* 右: 操作ボタン */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 140 }}>
          <div style={{ fontSize: 12, color: "#78716c", textAlign: "center" }}>
            {displayBoard.turn === "black" ? "☗先手番" : "☖後手番"}
          </div>
          {extraMoves.length > 0 && (
            <button onClick={() => setExtraMoves([])} style={btnStyle}>
              変化手順をリセット
            </button>
          )}
          <button onClick={onLeave} style={btnStyle}>感想戦を終了</button>
          <button onClick={onBackToLobby} style={btnStyleDark}>ロビーに戻る</button>
        </div>
      </div>

      {promotionPending && <PromotionDialog onConfirm={confirmPromotion} />}
    </div>
  );
}

function NavBtn({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 8px", fontSize: 16, borderRadius: 6,
        border: "1px solid #d6d3d1", backgroundColor: "#fff",
        cursor: "pointer", lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 12px", fontSize: 12, borderRadius: 6,
  border: "1px solid #d6d3d1", backgroundColor: "#fff",
  cursor: "pointer",
};

const btnStyleDark: React.CSSProperties = {
  padding: "8px 16px", fontSize: 13, fontWeight: "bold", borderRadius: 8,
  border: "none", backgroundColor: "#44403c", color: "#fff",
  cursor: "pointer",
};
