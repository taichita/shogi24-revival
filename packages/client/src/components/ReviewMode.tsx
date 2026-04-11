"use client";

import { useState, useMemo, useCallback } from "react";
import type { Move, Pos, DroppableKind, Color, GameState } from "@shogi24/engine";
import {
  getLegalMovesFrom, getLegalDrops, makeMove as engineMakeMove, moveToJapanese,
} from "@shogi24/engine";
import { ShogiBoard } from "./ShogiBoard";
import { HandPieces } from "./HandPieces";
import { PromotionDialog } from "./PromotionDialog";
import { ChatPanel, type ChatMessage } from "./ChatPanel";

type BoardView = "local" | "mine" | "opponent";

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

export function ReviewMode({
  myColor, myBoard, opponentBoard,
  onReviewMove, onUndo, onReset, onLeave, onBackToLobby,
  chatMessages, onSendChat, myHandle,
  blackHandle, whiteHandle,
}: Props) {
  const [view, setView] = useState<BoardView>("mine");
  const [localBoard, setLocalBoard] = useState<GameState | null>(myBoard);
  const [localHistory, setLocalHistory] = useState<GameState[]>([]);
  const [selection, setSelection] = useState<SelectionState>({ type: "none" });
  const [promotionPending, setPromotionPending] = useState<PromotionChoice | null>(null);
  const flipped = myColor === "white";

  // 表示するボード
  const displayBoard = useMemo(() => {
    if (view === "local") return localBoard;
    if (view === "mine") return myBoard;
    return opponentBoard;
  }, [view, localBoard, myBoard, opponentBoard]);

  const isEditable = view === "local" || view === "mine";

  const executeMove = useCallback((move: Move) => {
    if (!displayBoard) return;

    if (view === "local") {
      try {
        const newBoard = engineMakeMove(displayBoard, move);
        setLocalHistory((h) => [...h, displayBoard]);
        setLocalBoard(newBoard);
      } catch { /* invalid move */ }
    } else if (view === "mine") {
      onReviewMove(move);
    }
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [displayBoard, view, onReviewMove]);

  const selectCell = useCallback((pos: Pos) => {
    if (!displayBoard || !isEditable || promotionPending) return;

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

    const piece = displayBoard.board[pos.row][pos.col];
    if (piece && piece.color === displayBoard.turn) {
      setSelection({ type: "piece", from: pos, moves: getLegalMovesFrom(displayBoard, pos) });
      return;
    }
    setSelection({ type: "none" });
  }, [displayBoard, isEditable, selection, promotionPending, executeMove]);

  const selectHandPiece = useCallback((kind: DroppableKind) => {
    if (!displayBoard || !isEditable) return;
    const drops = getLegalDrops(displayBoard, kind);
    if (drops.length > 0) setSelection({ type: "drop", kind, moves: drops });
  }, [displayBoard, isEditable]);

  const confirmPromotion = useCallback((promote: boolean) => {
    if (!promotionPending) return;
    executeMove(promote ? promotionPending.promoteMove : promotionPending.noPromoteMove);
  }, [promotionPending, executeMove]);

  const handleUndo = () => {
    if (view === "local") {
      const prev = localHistory.pop();
      if (prev) {
        setLocalHistory([...localHistory]);
        setLocalBoard(prev);
      }
    } else if (view === "mine") {
      onUndo();
    }
  };

  const handleReset = (position: "initial" | "final") => {
    if (view === "local") {
      // ローカル: myBoardの元データ（final）かcreateGame（initial）
      if (position === "final") setLocalBoard(myBoard);
      else {
        // createGameを動的にimportする代わりにリセットイベントを使う
        onReset(position);
        // ローカルも同期
      }
      setLocalHistory([]);
    } else if (view === "mine") {
      onReset(position);
    }
  };

  // ビューを切り替えたらselectionをリセット
  const switchView = (v: BoardView) => {
    setView(v);
    setSelection({ type: "none" });
    setPromotionPending(null);
    if (v === "local" && !localBoard && myBoard) {
      setLocalBoard(JSON.parse(JSON.stringify(myBoard)));
    }
  };

  if (!displayBoard) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ fontSize: 16, marginBottom: 16 }}>
          {view === "opponent" ? "相手はまだ感想戦に参加していません" : "ボードを読み込み中..."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {view === "opponent" && (
            <button onClick={() => switchView("mine")} style={btnStyle}>自分盤に切替</button>
          )}
          <button onClick={onBackToLobby} style={btnStyleDark}>ロビーに戻る</button>
        </div>
      </div>
    );
  }

  const topColor: Color = flipped ? "black" : "white";
  const botColor: Color = flipped ? "white" : "black";
  const lastMove = displayBoard.moves.length > 0 ? displayBoard.moves[displayBoard.moves.length - 1] : undefined;

  const viewLabels: Record<BoardView, string> = {
    local: "ローカル（自分だけ）",
    mine: "自分盤（相手に共有）",
    opponent: "相手盤（観戦）",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: "bold", color: "#d97706" }}>
        感想戦 — {viewLabels[view]}
      </div>

      {/* モード切替 */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["local", "mine", "opponent"] as BoardView[]).map((v) => (
          <button
            key={v}
            onClick={() => switchView(v)}
            style={{
              padding: "4px 12px", fontSize: 12, borderRadius: 6,
              border: view === v ? "2px solid #d97706" : "1px solid #d6d3d1",
              backgroundColor: view === v ? "#fef3c7" : "#fff",
              fontWeight: view === v ? "bold" : "normal",
              cursor: "pointer",
            }}
          >
            {{ local: "ローカル", mine: "自分盤", opponent: "相手盤" }[v]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* 盤面 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {topColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
          </div>
          <HandPieces
            hand={displayBoard.hands[topColor]}
            color={topColor}
            isActive={false}
            selection={{ type: "none" }}
            onSelect={() => {}}
            flipped={flipped}
          />
          <ShogiBoard
            board={displayBoard.board}
            selection={isEditable ? selection : { type: "none" }}
            onCellClick={selectCell}
            lastMove={lastMove}
            flipped={flipped}
          />
          <HandPieces
            hand={displayBoard.hands[botColor]}
            color={botColor}
            isActive={isEditable}
            selection={selection}
            onSelect={selectHandPiece}
            flipped={flipped}
          />
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {botColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
          </div>
        </div>

        {/* 右パネル: チャット + 操作 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 200 }}>
          <ChatPanel messages={chatMessages} onSend={onSendChat} myHandle={myHandle} />
          {isEditable && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={handleUndo} style={btnStyle}>戻す</button>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => handleReset("initial")} style={{ ...btnStyle, flex: 1 }}>初期局面</button>
                <button onClick={() => handleReset("final")} style={{ ...btnStyle, flex: 1 }}>最終局面</button>
              </div>
            </div>
          )}
          <button onClick={onLeave} style={btnStyle}>感想戦を終了</button>
          <button onClick={onBackToLobby} style={btnStyleDark}>ロビーに戻る</button>
        </div>
      </div>

      {promotionPending && <PromotionDialog onConfirm={confirmPromotion} />}
    </div>
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
