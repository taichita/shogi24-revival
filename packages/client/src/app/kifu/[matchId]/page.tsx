"use client";

import { use, useState, useEffect, useMemo, useCallback } from "react";
import type { Move, Color, GameState } from "@shogi24/engine";
import { createGame, makeMove as engineMakeMove, moveToJapanese, ratingToRank } from "@shogi24/engine";
import { ShogiBoard } from "@/components/ShogiBoard";
import { HandPieces } from "@/components/HandPieces";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3025";

interface MatchDetail {
  id: string;
  blackId: string;
  whiteId: string;
  blackHandle: string | null;
  whiteHandle: string | null;
  winnerId: string | null;
  result: string;
  blackRating: number;
  whiteRating: number;
  ratingDelta: number;
  timePreset: string;
  moves: number;
  createdAt: string;
  movesJson: string | null;
}

function useViewportWidth() {
  const [w, setW] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

/** 指定手数までの盤面を再生 */
function replayToMove(moves: Move[], targetIndex: number): GameState {
  let state = createGame();
  for (let i = 0; i <= targetIndex && i < moves.length; i++) {
    try { state = engineMakeMove(state, moves[i]); } catch { break; }
  }
  return state;
}

const RESULT_LABELS: Record<string, string> = {
  checkmate: "詰み", resign: "投了", timeout: "時間切れ", disconnect: "切断",
};

export default function KifuPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [flipped, setFlipped] = useState(false);

  const viewportW = useViewportWidth();
  const isMobile = viewportW < 700;
  const mobileCell = viewportW < 360 ? 32 : (viewportW < 420 ? 36 : 40);
  const cellSize = isMobile ? mobileCell : 44;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/matches/${matchId}`);
        if (!res.ok) {
          setError(res.status === 404 ? "対局が見つかりません" : "取得に失敗しました");
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setMatch(data.match);
          // 最終局面から表示
          setCurrentMoveIndex((data.match?.moves ?? 1) - 1);
        }
      } catch {
        if (!cancelled) setError("通信エラー");
      }
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  const moves: Move[] = useMemo(() => {
    if (!match?.movesJson) return [];
    try { return JSON.parse(match.movesJson) as Move[]; } catch { return []; }
  }, [match?.movesJson]);

  const totalMoves = moves.length;
  const displayBoard = useMemo(() => {
    if (currentMoveIndex < 0) return createGame();
    return replayToMove(moves, currentMoveIndex);
  }, [moves, currentMoveIndex]);

  const moveHistory = useMemo(() => {
    return moves.map((m, i) => {
      const color: Color = i % 2 === 0 ? "black" : "white";
      return `${i + 1}. ${moveToJapanese(m, color)}`;
    });
  }, [moves]);

  const goToMove = useCallback((index: number) => {
    setCurrentMoveIndex(Math.max(-1, Math.min(totalMoves - 1, index)));
  }, [totalMoves]);

  if (error) {
    return (
      <main style={{ padding: 40, textAlign: "center" }}>
        <p style={{ fontSize: 16, marginBottom: 16 }}>{error}</p>
        <a href="/history" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
          戦績検索に戻る
        </a>
      </main>
    );
  }

  if (!match) {
    return <main style={{ padding: 40, textAlign: "center", fontSize: 14 }}>読み込み中...</main>;
  }

  const lastMove = currentMoveIndex >= 0 ? moves[currentMoveIndex] : undefined;
  const topColor: Color = flipped ? "black" : "white";
  const botColor: Color = flipped ? "white" : "black";
  const winnerLabel = match.winnerId === match.blackId ? match.blackHandle
    : match.winnerId === match.whiteId ? match.whiteHandle : "引き分け";
  const date = new Date(match.createdAt + "Z").toLocaleString("ja-JP");

  return (
    <main style={{
      flex: 1, display: "flex", flexDirection: "column",
      padding: isMobile ? "12px 4px" : "16px",
      gap: 8, minHeight: "100vh", alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: "bold" }}>R24将棋道場</h1>
        <span style={{ fontSize: 12, color: "#78716c" }}>棋譜再生</span>
      </div>

      {/* 対局情報ヘッダー */}
      <div style={{
        fontSize: 12, padding: "8px 12px",
        backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 8,
        display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
      }}>
        <span>☗{match.blackHandle} <span style={{ color: "#78716c" }}>{ratingToRank(match.blackRating)} R{match.blackRating}</span></span>
        <span>vs</span>
        <span>☖{match.whiteHandle} <span style={{ color: "#78716c" }}>{ratingToRank(match.whiteRating)} R{match.whiteRating}</span></span>
        <span style={{ color: "#b45309", fontWeight: "bold" }}>
          → {winnerLabel} の勝ち（{RESULT_LABELS[match.result] ?? match.result}）
        </span>
        <span style={{ color: "#78716c" }}>{match.moves}手 / {match.timePreset}</span>
        <span style={{ color: "#a8a29e" }}>{date}</span>
      </div>

      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap",
        justifyContent: "center", alignItems: "flex-start",
      }}>
        {/* 左: 棋譜 + ナビ（PCのみ、モバイルは下に） */}
        {!isMobile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 180 }}>
            <div style={{
              flex: 1, height: 420, overflowY: "auto",
              backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 8, padding: 8,
            }}>
              <div
                onClick={() => goToMove(-1)}
                style={{
                  padding: "2px 4px", borderRadius: 4, fontSize: 13, cursor: "pointer",
                  backgroundColor: currentMoveIndex === -1 ? "#fef3c7" : "transparent",
                  fontWeight: currentMoveIndex === -1 ? "bold" : "normal",
                }}
              >
                0. 開始局面
              </div>
              {moveHistory.map((m, i) => (
                <div key={i} onClick={() => goToMove(i)}
                  style={{
                    padding: "2px 4px", borderRadius: 4, fontSize: 13,
                    fontFamily: "monospace", cursor: "pointer",
                    backgroundColor: i === currentMoveIndex ? "#fef3c7" : "transparent",
                    fontWeight: i === currentMoveIndex ? "bold" : "normal",
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 盤面 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {topColor === "black" ? `☗ ${match.blackHandle}` : `☖ ${match.whiteHandle}`}
          </div>
          <HandPieces
            hand={displayBoard.hands[topColor]} color={topColor}
            isActive={false} selection={{ type: "none" }} onSelect={() => {}} flipped={flipped}
          />
          <ShogiBoard
            board={displayBoard.board} selection={{ type: "none" }}
            onCellClick={() => {}} lastMove={lastMove} flipped={flipped}
            cellSize={cellSize}
          />
          <HandPieces
            hand={displayBoard.hands[botColor]} color={botColor}
            isActive={false} selection={{ type: "none" }} onSelect={() => {}} flipped={flipped}
          />
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {botColor === "black" ? `☗ ${match.blackHandle}` : `☖ ${match.whiteHandle}`}
          </div>
        </div>
      </div>

      {/* ナビゲーションボタン */}
      <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
        <NavBtn label="⏮" title="初手に戻る" onClick={() => goToMove(-1)} />
        <NavBtn label="⏪" title="10手戻る" onClick={() => goToMove(currentMoveIndex - 10)} />
        <NavBtn label="◀" title="1手戻る" onClick={() => goToMove(currentMoveIndex - 1)} />
        <span style={{
          padding: "4px 12px", fontSize: 12, color: "#57534e",
          backgroundColor: "#fafaf9", borderRadius: 6, border: "1px solid #d6d3d1",
          minWidth: 80, textAlign: "center", fontFamily: "monospace",
        }}>
          {currentMoveIndex + 1} / {totalMoves}
        </span>
        <NavBtn label="▶" title="1手進む" onClick={() => goToMove(currentMoveIndex + 1)} />
        <NavBtn label="⏩" title="10手進む" onClick={() => goToMove(currentMoveIndex + 10)} />
        <NavBtn label="⏭" title="最終手" onClick={() => goToMove(totalMoves - 1)} />
        <button onClick={() => setFlipped(f => !f)}
          style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #d6d3d1", backgroundColor: "#fff", cursor: "pointer" }}>
          反転
        </button>
      </div>

      {/* モバイル時の棋譜（横スクロール） */}
      {isMobile && moveHistory.length > 0 && (
        <div style={{
          width: "100%", maxWidth: 360, fontSize: 11, fontFamily: "monospace",
          backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 6,
          padding: "4px 8px", overflowX: "auto", whiteSpace: "nowrap",
        }}>
          {moveHistory.map((m, i) => (
            <span key={i} onClick={() => goToMove(i)}
              style={{
                marginRight: 8, cursor: "pointer",
                fontWeight: i === currentMoveIndex ? "bold" : "normal",
                color: i === currentMoveIndex ? "#b45309" : "#57534e",
              }}>{m}</span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <a href="/history" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
          ← 戦績検索
        </a>
        <a href="/online" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
          オンライン対局
        </a>
      </div>
    </main>
  );
}

function NavBtn({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        padding: "4px 8px", fontSize: 16, borderRadius: 6,
        border: "1px solid #d6d3d1", backgroundColor: "#fff",
        cursor: "pointer", lineHeight: 1, minWidth: 36, minHeight: 36,
      }}>
      {label}
    </button>
  );
}
