"use client";

import { use, useState, useEffect, useMemo, useCallback } from "react";
import type { Move, Color, GameState, Pos, DroppableKind } from "@shogi24/engine";
import {
  createGame, makeMove as engineMakeMove, moveToJapanese, ratingToRank,
  getLegalMovesFrom, getLegalDrops,
} from "@shogi24/engine";
import { ShogiBoard } from "@/components/ShogiBoard";
import { HandPieces } from "@/components/HandPieces";
import { KifCopyButton } from "@/components/KifCopyButton";
import { PromotionDialog } from "@/components/PromotionDialog";

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

type SelectionState =
  | { type: "none" }
  | { type: "piece"; from: Pos; moves: Move[] }
  | { type: "drop"; kind: DroppableKind; moves: Move[] };

interface PromotionChoice { promoteMove: Move; noPromoteMove: Move; }

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

  // 変化手順
  const [variation, setVariation] = useState<Move[]>([]);
  const [variationIndex, setVariationIndex] = useState(-1);
  const [selection, setSelection] = useState<SelectionState>({ type: "none" });
  const [promotionPending, setPromotionPending] = useState<PromotionChoice | null>(null);

  // 自動再生
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeedMs, setAutoSpeedMs] = useState(1000);

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
          setCurrentMoveIndex(-1);  // 開始局面からスタート
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
  const inVariation = variation.length > 0;

  const displayBoard = useMemo(() => {
    let state = currentMoveIndex < 0 ? createGame() : replayToMove(moves, currentMoveIndex);
    for (let i = 0; i <= variationIndex && i < variation.length; i++) {
      try { state = engineMakeMove(state, variation[i]); } catch { break; }
    }
    return state;
  }, [moves, currentMoveIndex, variation, variationIndex]);

  const moveHistory = useMemo(() => {
    return moves.map((m, i) => {
      const color: Color = i % 2 === 0 ? "black" : "white";
      return `${i + 1}. ${moveToJapanese(m, color)}`;
    });
  }, [moves]);

  const variationHistory = useMemo(() => {
    // 変化手順の色: 分岐元の次の手番から始まる
    const startColor: Color = (currentMoveIndex + 1) % 2 === 0 ? "black" : "white";
    return variation.map((m, i) => {
      const color: Color = (i % 2 === 0) ? startColor : (startColor === "black" ? "white" : "black");
      return `V${i + 1}. ${moveToJapanese(m, color)}`;
    });
  }, [variation, currentMoveIndex]);

  const goToMove = useCallback((index: number) => {
    setCurrentMoveIndex(Math.max(-1, Math.min(totalMoves - 1, index)));
    setVariation([]);
    setVariationIndex(-1);
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [totalMoves]);

  const clearVariation = useCallback(() => {
    setVariation([]);
    setVariationIndex(-1);
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, []);

  const goToStart = () => goToMove(-1);
  const goBack10 = () => goToMove(currentMoveIndex - 10);
  const goForward10 = () => goToMove(currentMoveIndex + 10);
  const goToEnd = () => goToMove(totalMoves - 1);

  const goBack1 = () => {
    if (inVariation) {
      if (variationIndex >= 0) {
        setVariationIndex(variationIndex - 1);
        setSelection({ type: "none" });
        setPromotionPending(null);
      } else {
        clearVariation();
      }
    } else {
      goToMove(currentMoveIndex - 1);
    }
  };

  const goForward1 = useCallback(() => {
    if (inVariation) {
      if (variationIndex < variation.length - 1) {
        setVariationIndex(variationIndex + 1);
        setSelection({ type: "none" });
        setPromotionPending(null);
      }
    } else {
      setCurrentMoveIndex((i) => Math.min(totalMoves - 1, i + 1));
    }
  }, [inVariation, variation.length, variationIndex, totalMoves]);

  // 自動再生
  useEffect(() => {
    if (!autoPlay) return;
    if (inVariation) return; // 変化手順中は自動再生しない
    if (currentMoveIndex >= totalMoves - 1) {
      setAutoPlay(false);
      return;
    }
    const t = setTimeout(() => {
      setCurrentMoveIndex((i) => Math.min(totalMoves - 1, i + 1));
    }, autoSpeedMs);
    return () => clearTimeout(t);
  }, [autoPlay, autoSpeedMs, currentMoveIndex, totalMoves, inVariation]);

  // 変化手順の作成（盤面操作）
  const executeMove = useCallback((move: Move) => {
    try {
      engineMakeMove(displayBoard, move);
      const newVariation = [...variation.slice(0, variationIndex + 1), move];
      setVariation(newVariation);
      setVariationIndex(newVariation.length - 1);
    } catch { /* invalid */ }
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [displayBoard, variation, variationIndex]);

  const selectCell = useCallback((pos: Pos) => {
    if (promotionPending) return;
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
  }, [displayBoard, selection, promotionPending, executeMove]);

  const selectHandPiece = useCallback((kind: DroppableKind) => {
    const drops = getLegalDrops(displayBoard, kind);
    if (drops.length > 0) setSelection({ type: "drop", kind, moves: drops });
  }, [displayBoard]);

  const confirmPromotion = useCallback((promote: boolean) => {
    if (!promotionPending) return;
    executeMove(promote ? promotionPending.promoteMove : promotionPending.noPromoteMove);
  }, [promotionPending, executeMove]);

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

  const lastMove = inVariation && variationIndex >= 0
    ? variation[variationIndex]
    : currentMoveIndex >= 0 ? moves[currentMoveIndex] : undefined;

  const topColor: Color = flipped ? "black" : "white";
  const botColor: Color = flipped ? "white" : "black";
  const winnerLabel = match.winnerId === match.blackId ? match.blackHandle
    : match.winnerId === match.whiteId ? match.whiteHandle : "引き分け";
  const date = new Date(match.createdAt + "Z").toLocaleString("ja-JP");

  const statusText = inVariation
    ? `変化手順 ${variationIndex + 1}/${variation.length}手 — 分岐元: ${currentMoveIndex + 1}手目`
    : `${currentMoveIndex + 1} / ${totalMoves}手`;

  const kifCopyEl = (
    <KifCopyButton compact={isMobile}
      moves={moves}
      blackName={match.blackHandle ?? "先手"}
      whiteName={match.whiteHandle ?? "後手"}
      result={match.winnerId ? {
        winner: match.winnerId === match.blackId ? "black" : match.winnerId === match.whiteId ? "white" : null,
        reason: match.result as "checkmate" | "resign" | "timeout" | "disconnect",
      } : null}
      timePreset={match.timePreset}
      startDate={new Date(match.createdAt + "Z").toLocaleString("ja-JP")}
    />
  );

  return (
    <main style={{
      flex: 1, display: "flex", flexDirection: "column",
      padding: isMobile ? "12px 4px" : "16px",
      gap: 8, minHeight: "100vh", alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: "bold" }}>R24将棋道場</h1>
        <span style={{ fontSize: 12, color: "#78716c" }}>棋譜再生 {inVariation && <span style={{ color: "#b45309", fontWeight: "bold" }}>(変化手順)</span>}</span>
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
        {/* 左: 棋譜リスト（PCのみ） */}
        {!isMobile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 200 }}>
            <div style={{
              flex: 1, height: 360, overflowY: "auto",
              backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 8, padding: 8,
            }}>
              <div onClick={() => goToMove(-1)}
                style={{
                  padding: "2px 4px", borderRadius: 4, fontSize: 13, cursor: "pointer",
                  backgroundColor: currentMoveIndex === -1 && !inVariation ? "#fef3c7" : "transparent",
                  fontWeight: currentMoveIndex === -1 && !inVariation ? "bold" : "normal",
                }}>
                0. 開始局面
              </div>
              {moveHistory.map((m, i) => (
                <div key={i} onClick={() => goToMove(i)}
                  style={{
                    padding: "2px 4px", borderRadius: 4, fontSize: 13,
                    fontFamily: "monospace", cursor: "pointer",
                    backgroundColor: i === currentMoveIndex && !inVariation ? "#fef3c7" : "transparent",
                    fontWeight: i === currentMoveIndex && !inVariation ? "bold" : "normal",
                  }}>
                  {m}
                </div>
              ))}
              {inVariation && (
                <div style={{
                  marginTop: 6, paddingTop: 6, borderTop: "1px dashed #d6d3d1",
                  fontSize: 11, color: "#b45309", fontWeight: "bold",
                }}>
                  — 変化手順 —
                </div>
              )}
              {variationHistory.map((m, i) => (
                <div key={i} onClick={() => setVariationIndex(i)}
                  style={{
                    padding: "2px 4px", borderRadius: 4, fontSize: 13,
                    fontFamily: "monospace", cursor: "pointer",
                    backgroundColor: i === variationIndex ? "#fef3c7" : "transparent",
                    color: "#b45309",
                    fontWeight: i === variationIndex ? "bold" : "normal",
                  }}>
                  {m}
                </div>
              ))}
            </div>

            {/* 自動再生コントロール */}
            <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
              <button onClick={() => setAutoPlay(p => !p)}
                disabled={inVariation}
                style={{
                  padding: "4px 8px", fontSize: 11, borderRadius: 6,
                  border: "1px solid #d6d3d1",
                  backgroundColor: autoPlay ? "#fee2e2" : "#dbeafe",
                  cursor: inVariation ? "not-allowed" : "pointer",
                  opacity: inVariation ? 0.5 : 1,
                }}>
                {autoPlay ? "⏸停止" : "▶自動再生"}
              </button>
              <select value={autoSpeedMs} onChange={(e) => setAutoSpeedMs(Number(e.target.value))}
                style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid #d6d3d1" }}>
                <option value={500}>0.5秒</option>
                <option value={1000}>1秒</option>
                <option value={2000}>2秒</option>
                <option value={3000}>3秒</option>
              </select>
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
            isActive={displayBoard.turn === topColor}
            selection={selection} onSelect={selectHandPiece} flipped={flipped}
            cellSize={cellSize}
          />
          <ShogiBoard
            board={displayBoard.board} selection={selection}
            onCellClick={selectCell} lastMove={lastMove} flipped={flipped}
            cellSize={cellSize}
          />
          <HandPieces
            hand={displayBoard.hands[botColor]} color={botColor}
            isActive={displayBoard.turn === botColor}
            selection={selection} onSelect={selectHandPiece} flipped={flipped}
            cellSize={cellSize}
          />
          <div style={{ fontSize: 12, color: "#78716c" }}>
            {botColor === "black" ? `☗ ${match.blackHandle}` : `☖ ${match.whiteHandle}`}
          </div>

          {/* ステータス + ナビゲーションボタン（盤直下に固定） */}
          <div style={{
            fontSize: 11, color: inVariation ? "#b45309" : "#57534e",
            fontWeight: inVariation ? "bold" : "normal",
            marginTop: 4,
          }}>
            {statusText}
          </div>
          <div style={{
            display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap",
            marginTop: 2, width: 9 * cellSize + 4,
          }}>
            <NavBtn label="⏮" title="初手に戻る（変化は削除）" onClick={goToStart} />
            <NavBtn label="⏪" title="10手戻る（変化は削除）" onClick={goBack10} />
            <NavBtn label="◀" title={inVariation ? "変化内で1手戻る" : "1手戻る"} onClick={goBack1} />
            <NavBtn label="▶" title={inVariation ? "変化内で1手進む" : "1手進む"} onClick={goForward1} />
            <NavBtn label="⏩" title="10手進む（変化は削除）" onClick={goForward10} />
            <NavBtn label="⏭" title="最終手（変化は削除）" onClick={goToEnd} />
          </div>
          <div style={{
            display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap",
            marginTop: 4, width: 9 * cellSize + 4,
          }}>
            <button onClick={() => setFlipped(f => !f)}
              style={secondaryBtn}>反転</button>
            {inVariation && (
              <button onClick={clearVariation}
                style={{ ...secondaryBtn, backgroundColor: "#fef3c7", color: "#b45309", fontWeight: "bold" }}>
                変化削除
              </button>
            )}
            {kifCopyEl}
          </div>

          {/* モバイル時の棋譜（縦スクロール・折りたたみ） */}
          {isMobile && moveHistory.length > 0 && (
            <div style={{
              width: 9 * cellSize + 4, marginTop: 6,
              fontSize: 12, fontFamily: "monospace",
              backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 6,
              padding: "4px 8px",
              maxHeight: 140, overflowY: "auto",
            }}>
              <div onClick={() => goToMove(-1)}
                style={{
                  padding: "2px 4px", borderRadius: 4, cursor: "pointer",
                  backgroundColor: currentMoveIndex === -1 && !inVariation ? "#fef3c7" : "transparent",
                  fontWeight: currentMoveIndex === -1 && !inVariation ? "bold" : "normal",
                }}>
                0. 開始局面
              </div>
              {moveHistory.map((m, i) => (
                <div key={i} onClick={() => goToMove(i)}
                  style={{
                    padding: "2px 4px", borderRadius: 4, cursor: "pointer",
                    backgroundColor: i === currentMoveIndex && !inVariation ? "#fef3c7" : "transparent",
                    fontWeight: i === currentMoveIndex && !inVariation ? "bold" : "normal",
                    color: i === currentMoveIndex && !inVariation ? "#b45309" : "#57534e",
                  }}>{m}</div>
              ))}
              {inVariation && (
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #d6d3d1", fontSize: 10, color: "#b45309", fontWeight: "bold" }}>
                  — 変化手順 —
                </div>
              )}
              {variationHistory.map((m, i) => (
                <div key={i} onClick={() => setVariationIndex(i)}
                  style={{
                    padding: "2px 4px", borderRadius: 4, cursor: "pointer",
                    backgroundColor: i === variationIndex ? "#fef3c7" : "transparent",
                    color: "#b45309",
                    fontWeight: i === variationIndex ? "bold" : "normal",
                  }}>{m}</div>
              ))}
            </div>
          )}

          {/* モバイル自動再生 */}
          {isMobile && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, marginTop: 4 }}>
              <button onClick={() => setAutoPlay(p => !p)}
                disabled={inVariation}
                style={{
                  padding: "4px 10px", fontSize: 11, borderRadius: 4,
                  border: "1px solid #d6d3d1", fontWeight: "bold",
                  backgroundColor: autoPlay ? "#fee2e2" : "#dbeafe",
                  cursor: inVariation ? "not-allowed" : "pointer",
                  opacity: inVariation ? 0.5 : 1,
                }}>
                {autoPlay ? "⏸停止" : "▶自動再生"}
              </button>
              <select value={autoSpeedMs} onChange={(e) => setAutoSpeedMs(Number(e.target.value))}
                style={{ fontSize: 11, padding: "3px 4px", borderRadius: 4, border: "1px solid #d6d3d1" }}>
                <option value={500}>0.5秒</option>
                <option value={1000}>1秒</option>
                <option value={2000}>2秒</option>
                <option value={3000}>3秒</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {promotionPending && <PromotionDialog onConfirm={confirmPromotion} />}

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

const secondaryBtn: React.CSSProperties = {
  padding: "4px 10px", fontSize: 12, borderRadius: 6,
  border: "1px solid #d6d3d1", backgroundColor: "#fff",
  cursor: "pointer",
};
