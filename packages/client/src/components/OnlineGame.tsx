"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Move, Pos, DroppableKind, Color } from "@shogi24/engine";
import {
  getLegalMovesFrom, getLegalDrops,
  isCheckmate, isCheck, moveToJapanese,
} from "@shogi24/engine";
import type { OnlineMatchState } from "@/hooks/useSocket";
import { ShogiBoard } from "./ShogiBoard";
import { HandPieces } from "./HandPieces";
import { PromotionDialog } from "./PromotionDialog";
import { MoveList } from "./MoveList";
import { playMoveSound, playBeep } from "@/lib/sounds";

type SelectionState =
  | { type: "none" }
  | { type: "piece"; from: Pos; moves: Move[] }
  | { type: "drop"; kind: DroppableKind; moves: Move[] };

interface PromotionChoice { promoteMove: Move; noPromoteMove: Move; }

interface Props {
  match: OnlineMatchState;
  onMove: (move: Move) => void;
  onResign: () => void;
}

const BOARD_W = 9 * 44 + 4;

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function OnlineGame({ match, onMove, onResign }: Props) {
  const [selection, setSelection] = useState<SelectionState>({ type: "none" });
  const [promotionPending, setPromotionPending] = useState<PromotionChoice | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(match.myColor === "white");
  const prevMoveCount = useRef(0);

  const game = match.game;
  const myColor = match.myColor;
  const isMyTurn = game ? game.turn === myColor : false;

  // 着手音: 手数が増えたら鳴らす
  useEffect(() => {
    if (!game) return;
    if (game.moveCount > prevMoveCount.current) {
      playMoveSound();
      prevMoveCount.current = game.moveCount;
    }
  }, [game?.moveCount]);

  // 秒読み音: 自分の手番で秒読み中に鳴らす
  useEffect(() => {
    if (!match.clock || !game || match.result || !isMyTurn) return;
    const myClock = match.clock[myColor];
    if (!myClock.inByoyomi) return;

    const remainSec = Math.floor(myClock.remainMs / 1000);
    if (remainSec <= 5) {
      playBeep(true); // 残り5秒以下: 長い音
    } else if (remainSec <= 10) {
      playBeep(false); // 残り10秒以下: 毎秒ビープ
    } else if (remainSec % 10 === 0 && remainSec > 0) {
      playBeep(false); // 10秒ごとのビープ
    }
  }, [match.clock, isMyTurn, myColor, game, match.result]);

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

  const executeMove = useCallback((move: Move) => {
    if (!game) return;
    const label = `${game.moveCount + 1}. ${moveToJapanese(move, game.turn)}`;
    setMoveHistory((h) => [...h, label]);
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

  if (!game) {
    return <div style={{ padding: 40, textAlign: "center", fontSize: 18 }}>対局準備中...</div>;
  }

  const lastMove = game.moves.length > 0 ? game.moves[game.moves.length - 1] : undefined;

  // flip時: 上が自分、下が相手 → 逆にする
  const topColor: Color = flipped ? "black" : "white";
  const botColor: Color = flipped ? "white" : "black";
  const topPlayer = topColor === "black" ? match.blackPlayer : match.whitePlayer;
  const botPlayer = botColor === "black" ? match.blackPlayer : match.whitePlayer;
  const topClock = match.clock?.[topColor];
  const botClock = match.clock?.[botColor];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ fontSize: 15, fontWeight: "bold" }}>{status}</div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* 盤面エリア */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <PlayerBar
            handle={topPlayer.handle} rating={topPlayer.rating}
            clock={topClock} isActive={game.turn === topColor && !match.result}
            color={topColor}
          />
          <HandPieces
            hand={game.hands[topColor]}
            color={topColor}
            isActive={false}
            selection={{ type: "none" }}
            onSelect={() => {}}
            flipped={flipped}
          />
          <ShogiBoard
            board={game.board}
            selection={isMyTurn ? selection : { type: "none" }}
            onCellClick={selectCell}
            lastMove={lastMove}
            flipped={flipped}
          />
          <HandPieces
            hand={game.hands[botColor]}
            color={botColor}
            isActive={isMyTurn && !match.result}
            selection={selection}
            onSelect={selectHandPiece}
            flipped={flipped}
          />
          <PlayerBar
            handle={botPlayer.handle} rating={botPlayer.rating}
            clock={botClock} isActive={game.turn === botColor && !match.result}
            color={botColor}
          />
        </div>

        {/* 右: 棋譜+ボタン */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, height: 500 }}>
          <MoveList moves={moveHistory} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => setFlipped((f) => !f)}
              style={{
                padding: "4px 12px", fontSize: 12, backgroundColor: "#e7e5e4",
                borderRadius: 6, border: "none", cursor: "pointer",
              }}
            >
              盤面反転
            </button>
            {!match.result && (
              <button
                onClick={onResign}
                style={{
                  padding: "6px 14px", backgroundColor: "#44403c", color: "white",
                  borderRadius: 8, fontSize: 13, fontWeight: "bold", border: "none", cursor: "pointer",
                }}
              >
                投了
              </button>
            )}
          </div>
        </div>
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
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: BOARD_W, padding: "4px 10px",
        borderRadius: 6,
        backgroundColor: isActive ? "#fef3c7" : "#f5f5f4",
        border: isActive ? "2px solid #d97706" : "1px solid #d6d3d1",
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: "bold" }}>
        {symbol} {handle}
        <span style={{ fontSize: 11, color: "#78716c", marginLeft: 4 }}>R{rating}</span>
      </span>
      {clock && (
        <span
          style={{
            fontFamily: "monospace", fontSize: 18, fontWeight: "bold",
            color: low ? "#dc2626" : "#1c1917",
          }}
        >
          {formatTime(clock.remainMs)}
          {clock.inByoyomi && <span style={{ fontSize: 10, marginLeft: 3, color: "#78716c" }}>秒読み</span>}
        </span>
      )}
    </div>
  );
}
