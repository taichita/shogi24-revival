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
import { KifCopyButton } from "./KifCopyButton";
import type { ChatMessage } from "./ChatPanel";

type SelectionState =
  | { type: "none" }
  | { type: "piece"; from: Pos; moves: Move[] }
  | { type: "drop"; kind: DroppableKind; moves: Move[] };

interface PromotionChoice { promoteMove: Move; noPromoteMove: Move; }

interface Props {
  myColor: Color;
  myBoard: GameState | null;
  opponentBoard: GameState | null;
  finalGame: GameState | null;  // 対局終了時の盤面（相手盤の初期表示用）
  onReviewBoard: (board: GameState) => void;  // 自分盤の状態を相手に送信
  onLeave: () => void;
  onBackToLobby: () => void;
  chatMessages: ChatMessage[];
  onSendChat: (message: string) => void;
  myHandle: string | null;
  blackHandle: string;
  whiteHandle: string;
}

type ViewMode = "mine" | "opponent";

function useViewportWidth() {
  const [w, setW] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

/** 手のリストからn手目までの局面を再現する */
function replayToMove(moves: Move[], targetIndex: number): GameState {
  let state = createGame();
  for (let i = 0; i <= targetIndex && i < moves.length; i++) {
    try { state = engineMakeMove(state, moves[i]); } catch { break; }
  }
  return state;
}

const DESKTOP_CELL = 44;
const DESKTOP_TRAY_W = DESKTOP_CELL + 6;
const BOARD_W = 9 * DESKTOP_CELL + 4;
const BOARD_H = 9 * DESKTOP_CELL + 4;

export function ReviewMode({
  myColor, myBoard, opponentBoard, finalGame,
  onReviewBoard, onLeave, onBackToLobby,
  chatMessages, onSendChat, myHandle,
  blackHandle, whiteHandle,
}: Props) {
  // 全手記録（棋譜表示/ナビ用）
  const allMoves = useMemo(() => finalGame?.moves ?? myBoard?.moves ?? [], [finalGame, myBoard]);
  const totalMoves = allMoves.length;

  // 自分盤の現在手数（ベース手順、変化手順の分岐元）
  const [currentMoveIndex, setCurrentMoveIndex] = useState(totalMoves - 1);
  // 変化手順：分岐元局面以降に自分で指した手
  const [variation, setVariation] = useState<Move[]>([]);
  // 変化手順の現在インデックス（-1 = 分岐元そのもの / 0..variation.length-1 = その手目まで進んだ状態）
  const [variationIndex, setVariationIndex] = useState(-1);

  const [view, setView] = useState<ViewMode>("mine");
  const [selection, setSelection] = useState<SelectionState>({ type: "none" });
  const [promotionPending, setPromotionPending] = useState<PromotionChoice | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatOpenMobile, setChatOpenMobile] = useState(false);

  const viewportW = useViewportWidth();
  const isMobile = viewportW < 700;
  const mobileCell = viewportW < 360 ? 32 : (viewportW < 420 ? 36 : 40);
  const cellSize = isMobile ? mobileCell : DESKTOP_CELL;
  const mobileBoardW = 9 * cellSize + 4;
  const flipped = myColor === "white";

  // 自分盤の現局面を計算
  const myDisplayBoard = useMemo(() => {
    let state = currentMoveIndex < 0 ? createGame() : replayToMove(allMoves, currentMoveIndex);
    for (let i = 0; i <= variationIndex && i < variation.length; i++) {
      try { state = engineMakeMove(state, variation[i]); } catch { break; }
    }
    return state;
  }, [allMoves, currentMoveIndex, variation, variationIndex]);

  const inVariation = variation.length > 0;

  // 相手盤: opponentBoardがなければfinalGameをfallback
  const oppDisplayBoard = opponentBoard ?? finalGame ?? myDisplayBoard;

  const displayBoard = view === "mine" ? myDisplayBoard : oppDisplayBoard;
  const isEditable = view === "mine";

  // 自分盤が変化したら相手に同期
  useEffect(() => {
    if (myDisplayBoard) onReviewBoard(myDisplayBoard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDisplayBoard]);

  // 棋譜表示用
  const moveHistory = useMemo(() => {
    return allMoves.map((m, i) => {
      const color: Color = i % 2 === 0 ? "black" : "white";
      return `${i + 1}. ${moveToJapanese(m, color)}`;
    });
  }, [allMoves]);

  // ベース手順へジャンプ（変化は全消去）
  const goToMove = useCallback((index: number) => {
    setCurrentMoveIndex(Math.max(-1, Math.min(totalMoves - 1, index)));
    setVariation([]);
    setVariationIndex(-1);
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [totalMoves]);

  // 変化手順を削除（ベース手順の現在位置に戻る）
  const clearVariation = useCallback(() => {
    setVariation([]);
    setVariationIndex(-1);
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, []);

  // 一括移動ボタン: 変化手順があれば削除してベースで移動
  const goToStart = () => goToMove(-1);
  const goBack10 = () => goToMove(currentMoveIndex - 10);
  const goForward10 = () => goToMove(currentMoveIndex + 10);
  const goToEnd = () => goToMove(totalMoves - 1);

  // 1手戻る: 変化手順内ならvariationIndexを戻す、そうでなければベース手順で1手戻る
  const goBack1 = () => {
    if (inVariation) {
      if (variationIndex >= 0) {
        setVariationIndex(variationIndex - 1);
        setSelection({ type: "none" });
        setPromotionPending(null);
      } else {
        // 変化の分岐元まで戻ったら、変化自体をクリアしてさらにベース手順を1手戻る
        clearVariation();
      }
    } else {
      goToMove(currentMoveIndex - 1);
    }
  };

  // 1手進む: 変化手順内で未到達の手があれば進める、ベース手順ならベースで1手進む
  const goForward1 = () => {
    if (inVariation) {
      if (variationIndex < variation.length - 1) {
        setVariationIndex(variationIndex + 1);
        setSelection({ type: "none" });
        setPromotionPending(null);
      }
      // 変化手順の末尾にいる場合は進めない（新しい手を指すことで伸ばす）
    } else {
      goToMove(currentMoveIndex + 1);
    }
  };

  // 自分盤で着手（変化手順を伸ばす、または分岐）
  const executeMove = useCallback((move: Move) => {
    if (!isEditable || !myDisplayBoard) return;
    try {
      engineMakeMove(myDisplayBoard, move); // 合法性チェック
      // variationIndex より後ろは捨てて、新しい手を末尾に追加
      const newVariation = [...variation.slice(0, variationIndex + 1), move];
      setVariation(newVariation);
      setVariationIndex(newVariation.length - 1);
    } catch { /* invalid */ }
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [isEditable, myDisplayBoard, variation, variationIndex]);

  const selectCell = useCallback((pos: Pos) => {
    if (!isEditable || !myDisplayBoard || promotionPending) return;
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
    const piece = myDisplayBoard.board[pos.row][pos.col];
    if (piece && piece.color === myDisplayBoard.turn) {
      setSelection({ type: "piece", from: pos, moves: getLegalMovesFrom(myDisplayBoard, pos) });
      return;
    }
    setSelection({ type: "none" });
  }, [isEditable, myDisplayBoard, selection, promotionPending, executeMove]);

  const selectHandPiece = useCallback((kind: DroppableKind) => {
    if (!isEditable || !myDisplayBoard) return;
    const drops = getLegalDrops(myDisplayBoard, kind);
    if (drops.length > 0) setSelection({ type: "drop", kind, moves: drops });
  }, [isEditable, myDisplayBoard]);

  const confirmPromotion = useCallback((promote: boolean) => {
    if (!promotionPending) return;
    executeMove(promote ? promotionPending.promoteMove : promotionPending.noPromoteMove);
  }, [promotionPending, executeMove]);

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (text.length === 0) return;
    onSendChat(text);
    setChatInput("");
  };

  if (!displayBoard) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ fontSize: 16, marginBottom: 16 }}>読み込み中...</p>
        <button onClick={onBackToLobby} style={btnStyleDark}>ロビーに戻る</button>
      </div>
    );
  }

  const lastMove = displayBoard.moves.length > 0 ? displayBoard.moves[displayBoard.moves.length - 1] : undefined;
  const topColor: Color = flipped ? "black" : "white";
  const botColor: Color = flipped ? "white" : "black";

  const statusText = view === "mine"
    ? (inVariation
        ? `自分盤（変化手順 ${variationIndex + 1}/${variation.length}手 — 分岐元: ${currentMoveIndex + 1}手目）`
        : `自分盤（${currentMoveIndex + 1}手目 / ${totalMoves}手）`)
    : (opponentBoard ? "相手盤（相手の検討中）" : "相手盤（最終局面）");

  // ========================================================================
  // モバイル版レイアウト
  // ========================================================================
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", alignItems: "center" }}>
        {/* ヘッダー */}
        <div style={{ fontSize: 13, fontWeight: "bold", color: "#d97706" }}>
          感想戦 — {statusText}
        </div>

        {/* 視点切り替え */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["mine", "opponent"] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => { setView(v); setSelection({ type: "none" }); }}
              style={{
                padding: "4px 10px", fontSize: 11, borderRadius: 6,
                border: view === v ? "2px solid #d97706" : "1px solid #d6d3d1",
                backgroundColor: view === v ? "#fef3c7" : "#fff",
                fontWeight: view === v ? "bold" : "normal", cursor: "pointer",
              }}>
              {v === "mine" ? "自分盤" : "相手盤"}
            </button>
          ))}
        </div>

        {/* プレイヤー名（上） */}
        <div style={{ fontSize: 11, color: "#78716c", width: mobileBoardW, textAlign: "center" }}>
          {topColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
        </div>

        {/* 相手持ち駒（横並び、盤幅に揃える） */}
        <HandPieces
          hand={displayBoard.hands[topColor]} color={topColor}
          isActive={isEditable && displayBoard.turn === topColor}
          selection={selection} onSelect={selectHandPiece} flipped={flipped}
          cellSize={cellSize}
        />

        {/* 盤面 */}
        <ShogiBoard
          board={displayBoard.board}
          selection={isEditable ? selection : { type: "none" }}
          onCellClick={selectCell} lastMove={lastMove} flipped={flipped}
          cellSize={cellSize}
        />

        {/* 自分持ち駒（横並び、盤幅に揃える） */}
        <HandPieces
          hand={displayBoard.hands[botColor]} color={botColor}
          isActive={isEditable && displayBoard.turn === botColor}
          selection={selection} onSelect={selectHandPiece} flipped={flipped}
          cellSize={cellSize}
        />

        {/* プレイヤー名（下） */}
        <div style={{ fontSize: 11, color: "#78716c", width: mobileBoardW, textAlign: "center" }}>
          {botColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
        </div>

        {/* ナビゲーションボタン */}
        {view === "mine" && (
          <div style={{ display: "flex", gap: 3, justifyContent: "center", width: mobileBoardW, flexWrap: "wrap" }}>
            <NavBtn label="⏮" title="初手" onClick={goToStart} />
            <NavBtn label="⏪" title="10戻" onClick={goBack10} />
            <NavBtn label="◀" title="1戻" onClick={goBack1} />
            <NavBtn label="▶" title="1進" onClick={goForward1} />
            <NavBtn label="⏩" title="10進" onClick={goForward10} />
            <NavBtn label="⏭" title="最終" onClick={goToEnd} />
          </div>
        )}

        {/* 操作ボタン */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", width: mobileBoardW }}>
          {inVariation && view === "mine" && (
            <button onClick={clearVariation} style={mobileBtn("#fef3c7", "#b45309")}>
              変化削除
            </button>
          )}
          <button onClick={() => setChatOpenMobile(v => !v)} style={mobileBtn("#e7e5e4", "#1c1917")}>
            💬{chatMessages.length > 0 ? chatMessages.length : ""}
          </button>
          <KifCopyButton compact
            moves={allMoves}
            blackName={blackHandle}
            whiteName={whiteHandle}
            result={finalGame?.result ?? null}
          />
          <button onClick={onLeave} style={mobileBtn("#e7e5e4", "#1c1917")}>終了</button>
          <button onClick={onBackToLobby} style={mobileBtn("#44403c", "#fff")}>ロビー</button>
        </div>

        {/* 棋譜（横スクロール） */}
        {view === "mine" && (
          <div style={{
            width: mobileBoardW, fontSize: 11, fontFamily: "monospace",
            backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 6,
            padding: "4px 8px", overflowX: "auto", whiteSpace: "nowrap",
          }}>
            <span onClick={() => goToMove(-1)}
              style={{
                marginRight: 8, cursor: "pointer",
                fontWeight: currentMoveIndex === -1 && !inVariation ? "bold" : "normal",
                color: currentMoveIndex === -1 && !inVariation ? "#b45309" : "#57534e",
              }}>0.開始</span>
            {moveHistory.map((m, i) => (
              <span key={i} onClick={() => goToMove(i)}
                style={{
                  marginRight: 8, cursor: "pointer",
                  fontWeight: i === currentMoveIndex && !inVariation ? "bold" : "normal",
                  color: i === currentMoveIndex && !inVariation ? "#b45309" : "#57534e",
                }}>{m}</span>
            ))}
          </div>
        )}

        {/* チャット（トグル） */}
        {chatOpenMobile && (
          <div style={{
            width: mobileBoardW, height: 160,
            backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 8,
            padding: 6, display: "flex", flexDirection: "column",
          }}>
            <div style={{ flex: 1, overflowY: "auto", fontSize: 11, minHeight: 0 }}>
              {chatMessages.length === 0 && (
                <span style={{ color: "#a8a29e" }}>メッセージはまだありません</span>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 2, wordBreak: "break-word" }}>
                  <span style={{ fontWeight: m.sender === myHandle ? "bold" : "normal" }}>
                    {m.sender}:
                  </span>{" "}{m.message}
                </div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
              style={{ display: "flex", gap: 3, marginTop: 4 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                maxLength={200} placeholder="メッセージ..." autoComplete="off" enterKeyHint="send"
                style={{ flex: 1, padding: "4px 6px", fontSize: 11, borderRadius: 4, border: "1px solid #d6d3d1", outline: "none", minWidth: 0 }} />
              <button type="submit"
                style={{ padding: "4px 8px", fontSize: 11, borderRadius: 4, border: "1px solid #d6d3d1", backgroundColor: "#44403c", color: "#fff", cursor: "pointer" }}>
                送信
              </button>
            </form>
          </div>
        )}

        {promotionPending && <PromotionDialog onConfirm={confirmPromotion} />}
      </div>
    );
  }

  // ========================================================================
  // PC版レイアウト
  // ========================================================================
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ fontSize: 15, fontWeight: "bold", color: "#d97706" }}>
        感想戦 — {statusText}
      </div>

      {/* 視点切り替え */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["mine", "opponent"] as ViewMode[]).map((v) => (
          <button key={v} onClick={() => { setView(v); setSelection({ type: "none" }); }}
            style={{
              padding: "4px 16px", fontSize: 13, borderRadius: 6,
              border: view === v ? "2px solid #d97706" : "1px solid #d6d3d1",
              backgroundColor: view === v ? "#fef3c7" : "#fff",
              fontWeight: view === v ? "bold" : "normal", cursor: "pointer",
            }}>
            {v === "mine" ? "自分盤" : "相手盤"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
        {/* 左: 棋譜 + ナビ + チャット */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 200, height: BOARD_H + 90 }}>
          <div style={{
            flex: 1, overflowY: "auto", backgroundColor: "#fafaf9",
            border: "1px solid #d6d3d1", borderRadius: 8, padding: 8, minHeight: 0,
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
                  padding: "2px 4px", borderRadius: 4, fontSize: 13, fontFamily: "monospace", cursor: "pointer",
                  backgroundColor: i === currentMoveIndex && !inVariation ? "#fef3c7" : "transparent",
                  fontWeight: i === currentMoveIndex && !inVariation ? "bold" : "normal",
                }}>
                {m}
              </div>
            ))}
          </div>

          {/* ナビボタン（自分盤のみ） */}
          {view === "mine" && (
            <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
              <NavBtn label="⏮" title="初手" onClick={goToStart} />
              <NavBtn label="⏪" title="10戻" onClick={goBack10} />
              <NavBtn label="◀" title="1戻" onClick={goBack1} />
              <NavBtn label="▶" title="1進" onClick={goForward1} />
              <NavBtn label="⏩" title="10進" onClick={goForward10} />
              <NavBtn label="⏭" title="最終" onClick={goToEnd} />
            </div>
          )}

          {/* チャット */}
          <div style={{
            height: 160, flexShrink: 0,
            backgroundColor: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 8,
            padding: 8, display: "flex", flexDirection: "column",
          }}>
            <div style={{ flex: 1, overflowY: "auto", fontSize: 12, minHeight: 0 }}>
              {chatMessages.length === 0 && (
                <span style={{ color: "#a8a29e", fontSize: 11 }}>チャット</span>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 2, wordBreak: "break-word" }}>
                  <span style={{ fontWeight: m.sender === myHandle ? "bold" : "normal", color: m.sender === myHandle ? "#1c1917" : "#57534e" }}>
                    {m.sender}:
                  </span>{" "}
                  {m.message}
                </div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
              style={{ display: "flex", gap: 3, marginTop: 4 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                maxLength={200} placeholder="メッセージ..." autoComplete="off" enterKeyHint="send"
                style={{ flex: 1, padding: "3px 6px", fontSize: 11, borderRadius: 4, border: "1px solid #d6d3d1", outline: "none", minWidth: 0 }} />
              <button type="submit"
                style={{ padding: "3px 6px", fontSize: 11, borderRadius: 4, border: "1px solid #d6d3d1", backgroundColor: "#44403c", color: "#fff", cursor: "pointer" }}>
                送信
              </button>
            </form>
          </div>
        </div>

        {/* 中央: 盤面（対局画面と同じレイアウト） */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", flexShrink: 0 }}>
          <div style={{
            width: BOARD_W, padding: "4px 10px", borderRadius: 6,
            backgroundColor: "#f5f5f4", border: "1px solid #d6d3d1",
            fontSize: 13, textAlign: "center", fontWeight: "bold",
          }}>
            {topColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
          </div>

          {/* 盤面と持ち駒（対局画面と同様に絶対配置） */}
          <div style={{
            position: "relative",
            width: BOARD_W + 2 * (DESKTOP_TRAY_W + 6),
            height: BOARD_H + 40,
          }}>
            <div style={{ position: "absolute", left: 0, top: 20, maxHeight: BOARD_H, overflowY: "auto" }}>
              <HandPieces
                hand={displayBoard.hands[topColor]} color={topColor}
                isActive={isEditable && displayBoard.turn === topColor}
                selection={selection} onSelect={selectHandPiece} flipped={flipped}
                vertical cellSize={DESKTOP_CELL}
              />
            </div>
            <div style={{ position: "absolute", left: DESKTOP_TRAY_W + 6, top: 0 }}>
              <ShogiBoard
                board={displayBoard.board}
                selection={isEditable ? selection : { type: "none" }}
                onCellClick={selectCell} lastMove={lastMove} flipped={flipped}
              />
            </div>
            <div style={{ position: "absolute", right: 0, bottom: 0, maxHeight: BOARD_H, overflowY: "auto" }}>
              <HandPieces
                hand={displayBoard.hands[botColor]} color={botColor}
                isActive={isEditable && displayBoard.turn === botColor}
                selection={selection} onSelect={selectHandPiece} flipped={flipped}
                vertical cellSize={DESKTOP_CELL}
              />
            </div>
          </div>

          <div style={{
            width: BOARD_W, padding: "4px 10px", borderRadius: 6,
            backgroundColor: "#f5f5f4", border: "1px solid #d6d3d1",
            fontSize: 13, textAlign: "center", fontWeight: "bold",
          }}>
            {botColor === "black" ? `☗ ${blackHandle}` : `☖ ${whiteHandle}`}
          </div>
        </div>

        {/* 右: 操作ボタン */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 140 }}>
          <div style={{
            fontSize: 11, color: "#78716c", textAlign: "center",
            padding: "4px 8px", backgroundColor: "#fafaf9", borderRadius: 6,
          }}>
            {displayBoard.turn === "black" ? "☗先手番" : "☖後手番"}
          </div>
          <KifCopyButton
            moves={allMoves}
            blackName={blackHandle}
            whiteName={whiteHandle}
            result={finalGame?.result ?? null}
          />
          {inVariation && view === "mine" && (
            <button onClick={clearVariation} style={btnStyle}>
              変化削除
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
    <button onClick={onClick} title={title}
      style={{
        padding: "4px 8px", fontSize: 14, borderRadius: 6,
        border: "1px solid #d6d3d1", backgroundColor: "#fff",
        cursor: "pointer", lineHeight: 1, minWidth: 36, minHeight: 36,
      }}>
      {label}
    </button>
  );
}

function mobileBtn(bg: string, fg: string): React.CSSProperties {
  return {
    padding: "4px 8px", fontSize: 11, borderRadius: 4,
    border: "1px solid #d6d3d1", backgroundColor: bg, color: fg,
    cursor: "pointer", fontWeight: "bold", minHeight: 32,
  };
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
