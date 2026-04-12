"use client";

import { useGame } from "@/hooks/useGame";
import { ShogiBoard } from "@/components/ShogiBoard";
import { HandPieces } from "@/components/HandPieces";
import { PromotionDialog } from "@/components/PromotionDialog";
import { MoveList } from "@/components/MoveList";

export default function GamePage() {
  const {
    game, selection, moveHistory, status,
    selectCell, selectHandPiece, clearSelection,
    confirmPromotion, promotionPending, resign, reset,
  } = useGame();

  const lastMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : undefined;

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 16,
        minHeight: "100vh",
      }}
    >
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: "bold", letterSpacing: "0.05em" }}>
          R24将棋道場
        </h1>
        <span style={{ fontSize: 13, color: "#78716c" }}>ローカル対局</span>
      </div>

      {/* ステータス */}
      <div style={{ fontSize: 18, fontWeight: "bold" }}>{status}</div>

      {/* メインエリア */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* 盤面 + 持ち駒 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <HandPieces
            hand={game.hands.white}
            color="white"
            isActive={game.turn === "white" && !game.result}
            selection={selection}
            onSelect={selectHandPiece}
          />
          <ShogiBoard
            board={game.board}
            selection={selection}
            onCellClick={selectCell}
            lastMove={lastMove}
          />
          <HandPieces
            hand={game.hands.black}
            color="black"
            isActive={game.turn === "black" && !game.result}
            selection={selection}
            onSelect={selectHandPiece}
          />
        </div>

        {/* 棋譜 + ボタン */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, height: 560 }}>
          <MoveList moves={moveHistory} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!game.result && (
              <button
                onClick={resign}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#44403c",
                  color: "white",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: "bold",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                投了
              </button>
            )}
            <button
              onClick={reset}
              style={{
                padding: "8px 16px",
                backgroundColor: "#e7e5e4",
                color: "#44403c",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: "bold",
                border: "none",
                cursor: "pointer",
              }}
            >
              最初から
            </button>
            <button
              onClick={clearSelection}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                color: "#78716c",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              選択解除
            </button>
          </div>
        </div>
      </div>

      {promotionPending && <PromotionDialog onConfirm={confirmPromotion} />}

      <a href="/online" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
        オンライン対局はこちら
      </a>
    </main>
  );
}
