"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Move, Pos, DroppableKind, Color } from "@shogi24/engine";
import {
  getLegalMovesFrom, getLegalDrops,
  isCheckmate, isCheck, moveToJapanese,
} from "@shogi24/engine";
import type { OnlineMatchState, LobbyPlayer } from "@/hooks/useSocket";
import { ShogiBoard } from "./ShogiBoard";
import { HandPieces } from "./HandPieces";
import { PromotionDialog } from "./PromotionDialog";
import { MoveList } from "./MoveList";
import { LobbySidebar } from "./LobbySidebar";
import {
  playMoveSound, playBeep, playEndSound,
  getBgmEnabled, setBgmEnabled,
  getBgmTrack, setBgmTrack,
} from "@/lib/sounds";
import { ratingToRank } from "@shogi24/engine";

type SelectionState =
  | { type: "none" }
  | { type: "piece"; from: Pos; moves: Move[] }
  | { type: "drop"; kind: DroppableKind; moves: Move[] };

interface PromotionChoice { promoteMove: Move; noPromoteMove: Move; }

interface Props {
  match: OnlineMatchState;
  onMove: (move: Move) => void;
  onResign: () => void;
  chatMessages: { sender: string; message: string; timestamp: number }[];
  onSendChat: (message: string) => void;
  myHandle: string | null;
  lobbyPlayers: LobbyPlayer[];
  myId: string | null;
}

const CELL = 44;
const BOARD_W = 9 * CELL + 4;
const BOARD_H = 9 * CELL + 4;

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** 画面幅を監視 */
function useViewportWidth() {
  const [w, setW] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

export function OnlineGame({ match, onMove, onResign, chatMessages, onSendChat, myHandle, lobbyPlayers, myId }: Props) {
  const [selection, setSelection] = useState<SelectionState>({ type: "none" });
  const [promotionPending, setPromotionPending] = useState<PromotionChoice | null>(null);
  const [flipped, setFlipped] = useState(match.myColor === "white");
  const [chatInput, setChatInput] = useState("");
  const [showEndEffect, setShowEndEffect] = useState(false);
  const [bgmOn, setBgmOn] = useState(() => getBgmEnabled());
  const [bgmTrackState, setBgmTrackState] = useState(() => getBgmTrack());
  const prevMoveCount = useRef(0);
  const prevResult = useRef<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const viewportW = useViewportWidth();
  const isNarrow = viewportW < 900; // モバイル判定: ロビーサイドバーを非表示にする閾値

  const game = match.game;
  const myColor = match.myColor;
  const isMyTurn = game ? game.turn === myColor : false;

  // 着手音
  useEffect(() => {
    if (!game) return;
    if (game.moveCount > prevMoveCount.current) {
      playMoveSound();
      prevMoveCount.current = game.moveCount;
    }
  }, [game?.moveCount]);

  // 秒読み音
  useEffect(() => {
    if (!match.clock || !game || match.result || !isMyTurn) return;
    const myClock = match.clock[myColor];
    if (!myClock.inByoyomi) return;
    const remainSec = Math.floor(myClock.remainMs / 1000);
    if (remainSec <= 5) playBeep(true);
    else if (remainSec <= 10) playBeep(false);
    else if (remainSec % 10 === 0 && remainSec > 0) playBeep(false);
  }, [match.clock, isMyTurn, myColor, game, match.result]);

  // 対局終了エフェクト
  useEffect(() => {
    if (match.result && !prevResult.current) {
      prevResult.current = true;
      playEndSound();
      setShowEndEffect(true);
      setTimeout(() => setShowEndEffect(false), 2000);
    }
  }, [match.result]);

  // チャット自動スクロール（ページ全体はスクロールしない）
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [chatMessages.length]);

  const status = useMemo(() => {
    if (match.result) {
      const w = match.result.winner;
      if (w === null) return "引き分け";
      const wLabel = w === "black" ? match.blackPlayer.handle : match.whitePlayer.handle;
      const reasons: Record<string, string> = {
        checkmate: "詰み", resign: "投了", timeout: "時間切れ", disconnect: "切断",
      };
      return `${wLabel} の勝ち（${reasons[match.result.reason] ?? match.result.reason}）`;
    }
    if (!game) return "対局準備中...";
    const turnLabel = game.turn === "black" ? match.blackPlayer.handle : match.whitePlayer.handle;
    if (isCheckmate(game)) return "詰み";
    if (isCheck(game)) return `${turnLabel} — 王手！`;
    return `${turnLabel} の手番`;
  }, [game, match]);

  const moveHistory = useMemo(() => {
    if (!game) return [];
    return game.moves.map((m, i) => {
      const color: Color = i % 2 === 0 ? "black" : "white";
      return `${i + 1}. ${moveToJapanese(m, color)}`;
    });
  }, [game?.moves.length]);

  const executeMove = useCallback((move: Move) => {
    if (!game) return;
    onMove(move);
    setSelection({ type: "none" });
    setPromotionPending(null);
  }, [game, onMove]);

  const selectCell = useCallback((pos: Pos) => {
    if (!game || match.result || !isMyTurn || promotionPending) return;
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
    const piece = game.board[pos.row][pos.col];
    if (piece && piece.color === myColor && game.turn === myColor) {
      setSelection({ type: "piece", from: pos, moves: getLegalMovesFrom(game, pos) });
      return;
    }
    setSelection({ type: "none" });
  }, [game, match, isMyTurn, selection, promotionPending, myColor, executeMove]);

  const selectHandPiece = useCallback((kind: DroppableKind) => {
    if (!game || match.result || !isMyTurn) return;
    const drops = getLegalDrops(game, kind);
    if (drops.length > 0) setSelection({ type: "drop", kind, moves: drops });
  }, [game, match, isMyTurn]);

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

  if (!game) {
    return <div style={{ padding: 40, textAlign: "center", fontSize: 18 }}>対局準備中...</div>;
  }

  const lastMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : undefined;

  const topColor: Color = flipped ? "black" : "white";
  const botColor: Color = flipped ? "white" : "black";
  const topPlayer = topColor === "black" ? match.blackPlayer : match.whitePlayer;
  const botPlayer = botColor === "black" ? match.blackPlayer : match.whitePlayer;
  const topClock = match.clock?.[topColor];
  const botClock = match.clock?.[botColor];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {/* ステータス */}
      <div style={{
        fontSize: 15, fontWeight: "bold", textAlign: "center",
        ...(showEndEffect ? {
          fontSize: 20, padding: "8px 24px", backgroundColor: "#fef3c7",
          border: "2px solid #d97706", borderRadius: 10,
          animation: "pulse 0.5s ease-in-out 3",
        } : {}),
      }}>
        {status}
      </div>

      {/* メインエリア */}
      <div style={{
        display: "flex", gap: 10, justifyContent: "center",
        alignItems: "flex-start", flexWrap: "wrap",
      }}>

        {/* 左: 棋譜 + ボタン + チャット */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 6,
          width: 180, height: BOARD_H + 70, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
            <MoveList moves={moveHistory} />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => setFlipped((f) => !f)}
              style={{ padding: "3px 8px", fontSize: 11, backgroundColor: "#e7e5e4", borderRadius: 6, border: "none", cursor: "pointer" }}>
              反転
            </button>
            <button onClick={() => { const next = !bgmOn; setBgmOn(next); setBgmEnabled(next); }}
              style={{ padding: "3px 8px", fontSize: 11, backgroundColor: bgmOn ? "#dbeafe" : "#e7e5e4", borderRadius: 6, border: bgmOn ? "1px solid #93c5fd" : "none", cursor: "pointer" }}>
              BGM {bgmOn ? "ON" : "OFF"}
            </button>
            {bgmOn && (
              <select
                value={bgmTrackState}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  setBgmTrackState(t);
                  setBgmTrack(t);
                }}
                style={{ fontSize: 11, padding: "2px 4px", borderRadius: 6, border: "1px solid #d6d3d1" }}
              >
                <option value={1}>BGM 1</option>
                <option value={2}>BGM 2</option>
                <option value={3}>BGM 3</option>
              </select>
            )}
            {!match.result && (
              <button onClick={onResign}
                style={{ padding: "3px 8px", backgroundColor: "#44403c", color: "white", borderRadius: 6, fontSize: 11, fontWeight: "bold", border: "none", cursor: "pointer" }}>
                投了
              </button>
            )}
          </div>
          {/* チャット（縦型） */}
          <div style={{
            height: 120, flexShrink: 0,
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
              <div ref={chatBottomRef} />
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
              style={{ display: "flex", gap: 3, marginTop: 4 }}
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={200} placeholder="メッセージ..."
                autoComplete="off"
                enterKeyHint="send"
                style={{ flex: 1, padding: "3px 6px", fontSize: 11, borderRadius: 4, border: "1px solid #d6d3d1", outline: "none", minWidth: 0 }}
              />
              <button type="submit"
                style={{ padding: "3px 6px", fontSize: 11, borderRadius: 4, border: "1px solid #d6d3d1", backgroundColor: "#44403c", color: "#fff", cursor: "pointer" }}>
                送信
              </button>
            </form>
          </div>
        </div>

        {/* 中央: 盤面 + 持ち駒（absolute positioning で盤の角に配置） */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", flexShrink: 0 }}>
          {/* 相手プレイヤーバー */}
          <PlayerBar handle={topPlayer.handle} rating={topPlayer.rating}
            clock={topClock} isActive={game.turn === topColor && !match.result} color={topColor} />

          {/* 盤面と持ち駒（持ち駒は盤の角に absolute 配置、盤縦幅に収まる） */}
          <div style={{
            position: "relative",
            width: BOARD_W + 2 * (54 + 8),
            height: BOARD_H + 40, // ラベル分の余白
          }}>
            {/* 相手持ち駒(左上) */}
            <div style={{
              position: "absolute", left: 0, top: 20,
              maxHeight: BOARD_H, overflowY: "auto",
            }}>
              <HandPieces hand={game.hands[topColor]} color={topColor}
                isActive={false} selection={{ type: "none" }} onSelect={() => {}}
                flipped={flipped} vertical />
            </div>
            {/* 盤（中央） */}
            <div style={{ position: "absolute", left: 54 + 8, top: 0 }}>
              <ShogiBoard board={game.board}
                selection={isMyTurn ? selection : { type: "none" }}
                onCellClick={selectCell} lastMove={lastMove} flipped={flipped} />
            </div>
            {/* 自分持ち駒(右下) */}
            <div style={{
              position: "absolute", right: 0, bottom: 0,
              maxHeight: BOARD_H, overflowY: "auto",
            }}>
              <HandPieces hand={game.hands[botColor]} color={botColor}
                isActive={isMyTurn && !match.result} selection={selection}
                onSelect={selectHandPiece} flipped={flipped} vertical />
            </div>
          </div>

          {/* 自分プレイヤーバー */}
          <PlayerBar handle={botPlayer.handle} rating={botPlayer.rating}
            clock={botClock} isActive={game.turn === botColor && !match.result} color={botColor} />
        </div>

        {/* 右: ロビーサイドバー（狭い画面では非表示） */}
        {!isNarrow && <LobbySidebar players={lobbyPlayers} myId={myId} />}
      </div>

      {promotionPending && <PromotionDialog onConfirm={confirmPromotion} />}
    </div>
  );
}

function PlayerBar({ handle, rating, clock, isActive, color }: {
  handle: string; rating: number;
  clock?: { remainMs: number; inByoyomi: boolean };
  isActive: boolean; color: Color;
}) {
  const symbol = color === "black" ? "☗" : "☖";
  const low = clock && clock.remainMs <= 10000;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      width: BOARD_W, padding: "4px 10px", borderRadius: 6,
      backgroundColor: isActive ? "#fef3c7" : "#f5f5f4",
      border: isActive ? "2px solid #d97706" : "1px solid #d6d3d1",
      fontSize: 13,
    }}>
      <span style={{ fontWeight: "bold" }}>
        {symbol} {handle}
        <span style={{ fontSize: 11, color: "#78716c", marginLeft: 4 }}>{ratingToRank(rating)} R{rating}</span>
      </span>
      {clock && (
        <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: "bold", color: low ? "#dc2626" : "#1c1917" }}>
          {formatTime(clock.remainMs)}
          {clock.inByoyomi && <span style={{ fontSize: 10, marginLeft: 3, color: "#78716c" }}>秒読み</span>}
        </span>
      )}
    </div>
  );
}
