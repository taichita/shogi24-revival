"use client";

import { useState, useEffect } from "react";
import { useGame } from "@/hooks/useGame";
import { ShogiBoard } from "@/components/ShogiBoard";
import { HandPieces } from "@/components/HandPieces";
import { PromotionDialog } from "@/components/PromotionDialog";
import { MoveList } from "@/components/MoveList";

function useViewportWidth() {
  const [w, setW] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

export default function GamePage() {
  const {
    game, selection, moveHistory, status,
    selectCell, selectHandPiece, clearSelection,
    confirmPromotion, promotionPending, resign, reset,
  } = useGame();

  const lastMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : undefined;
  const viewportW = useViewportWidth();
  const isMobile = viewportW < 700;
  const mobileCell = viewportW < 360 ? 32 : (viewportW < 420 ? 36 : 40);
  const cellSize = isMobile ? mobileCell : 44;
  const mobileBoardW = 9 * cellSize + 4;

  // ========================================================================
  // モバイル版
  // ========================================================================
  if (isMobile) {
    return (
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", padding: "12px 4px", gap: 6, minHeight: "100vh",
      }}>
        {/* ヘッダー（コンパクト） */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ fontSize: 16, fontWeight: "bold", letterSpacing: "0.05em" }}>
            R24将棋道場
          </h1>
          <span style={{ fontSize: 11, color: "#78716c" }}>ローカル対局</span>
        </div>

        <div style={{ fontSize: 13, fontWeight: "bold" }}>{status}</div>

        {/* 相手（白）持ち駒 */}
        <HandPieces
          hand={game.hands.white} color="white"
          isActive={game.turn === "white" && !game.result}
          selection={selection} onSelect={selectHandPiece}
          cellSize={cellSize}
        />

        <ShogiBoard
          board={game.board} selection={selection}
          onCellClick={selectCell} lastMove={lastMove}
          cellSize={cellSize}
        />

        {/* 自分（黒）持ち駒 */}
        <HandPieces
          hand={game.hands.black} color="black"
          isActive={game.turn === "black" && !game.result}
          selection={selection} onSelect={selectHandPiece}
          cellSize={cellSize}
        />

        {/* 操作ボタン列 */}
        <div style={{
          display: "flex", gap: 4, flexWrap: "wrap",
          justifyContent: "center", width: mobileBoardW,
        }}>
          {!game.result && (
            <button onClick={resign} style={mobileBtn("#44403c", "#fff")}>投了</button>
          )}
          <button onClick={reset} style={mobileBtn("#e7e5e4", "#1c1917")}>最初から</button>
          <button onClick={clearSelection} style={mobileBtn("#e7e5e4", "#78716c")}>選択解除</button>
        </div>

        {/* 棋譜（横スクロール） */}
        <div style={{
          width: mobileBoardW, fontSize: 11, fontFamily: "monospace",
          backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 6,
          padding: "4px 8px", overflowX: "auto", whiteSpace: "nowrap",
        }}>
          {moveHistory.length === 0 && <span style={{ color: "#a8a29e" }}>棋譜</span>}
          {moveHistory.slice(-10).map((m, i, arr) => (
            <span key={i} style={{
              marginRight: 8,
              fontWeight: i === arr.length - 1 ? "bold" : "normal",
              color: i === arr.length - 1 ? "#b45309" : "#57534e",
            }}>{m}</span>
          ))}
        </div>

        {promotionPending && <PromotionDialog onConfirm={confirmPromotion} />}

        <a href="/online" style={{ fontSize: 12, color: "#78716c", textDecoration: "underline" }}>
          オンライン対局はこちら
        </a>
      </main>
    );
  }

  // ========================================================================
  // PC版（従来通り）
  // ========================================================================
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: "bold", letterSpacing: "0.05em" }}>
          R24将棋道場
        </h1>
        <span style={{ fontSize: 13, color: "#78716c" }}>ローカル対局</span>
      </div>

      <div style={{ fontSize: 18, fontWeight: "bold" }}>{status}</div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <HandPieces
            hand={game.hands.white} color="white"
            isActive={game.turn === "white" && !game.result}
            selection={selection} onSelect={selectHandPiece}
          />
          <ShogiBoard
            board={game.board} selection={selection}
            onCellClick={selectCell} lastMove={lastMove}
          />
          <HandPieces
            hand={game.hands.black} color="black"
            isActive={game.turn === "black" && !game.result}
            selection={selection} onSelect={selectHandPiece}
          />
        </div>

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

function mobileBtn(bg: string, fg: string): React.CSSProperties {
  return {
    padding: "6px 12px", fontSize: 12, borderRadius: 4,
    border: "1px solid #d6d3d1", backgroundColor: bg, color: fg,
    cursor: "pointer", fontWeight: "bold",
    minHeight: 36, minWidth: 60,
  };
}
