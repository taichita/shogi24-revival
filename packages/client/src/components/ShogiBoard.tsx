"use client";

import type { Piece, Pos, Move } from "@shogi24/engine";
import type { SelectionState } from "@/hooks/useGame";
import { pieceLabel } from "@/lib/piece-label";

interface Props {
  board: (Piece | null)[][];
  selection: SelectionState;
  onCellClick: (pos: Pos) => void;
  lastMove?: Move;
  flipped?: boolean;
  cellSize?: number;
}

const DEFAULT_CELL = 44;
const COL_LABELS = ["９", "８", "７", "６", "５", "４", "３", "２", "１"];
const ROW_LABELS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function ShogiBoard({ board, selection, onCellClick, lastMove, flipped = false, cellSize = DEFAULT_CELL }: Props) {
  const CELL = cellSize;
  const highlightSet = new Set<string>();
  if (selection.type === "piece" || selection.type === "drop") {
    for (const m of selection.moves) {
      highlightSet.add(`${m.to.row},${m.to.col}`);
    }
  }
  const selectedFrom =
    selection.type === "piece" ? `${selection.from.row},${selection.from.col}` : null;
  const lastMoveTo = lastMove ? `${lastMove.to.row},${lastMove.to.col}` : null;

  // 表示順: flippedなら row/col を逆順にする
  const rowOrder = flipped ? [8,7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7,8];
  const colOrder = flipped ? [8,7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7,8];
  const colLabels = flipped ? [...COL_LABELS].reverse() : COL_LABELS;
  const rowLabels = flipped ? [...ROW_LABELS].reverse() : ROW_LABELS;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column" }}>
      {/* 筋ラベル */}
      <div style={{ display: "flex", marginLeft: 20 }}>
        {colLabels.map((label, i) => (
          <div
            key={i}
            style={{
              width: CELL, height: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: "#78716c",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(9, ${CELL}px)`,
            gridTemplateRows: `repeat(9, ${CELL}px)`,
            backgroundColor: "#dbb87a",
            border: "2px solid #44403c",
          }}
        >
          {rowOrder.map((r) =>
            colOrder.map((c) => {
              const piece = board[r][c];
              const key = `${r},${c}`;
              const isHighlight = highlightSet.has(key);
              const isSelected = key === selectedFrom;
              const isLastTo = key === lastMoveTo;

              let bg = "transparent";
              if (isSelected) bg = "rgba(217, 176, 56, 0.45)";
              else if (isHighlight && piece) bg = "rgba(239, 68, 68, 0.3)";
              else if (isHighlight) bg = "rgba(74, 222, 128, 0.35)";
              else if (isLastTo) bg = "rgba(250, 204, 21, 0.3)";

              return (
                <button
                  key={`${r}-${c}`}
                  data-cell={`${r}-${c}`}
                  onClick={() => onCellClick({ row: r, col: c })}
                  style={{
                    width: CELL, height: CELL,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid rgba(120, 113, 108, 0.35)",
                    backgroundColor: bg,
                    cursor: "pointer",
                    padding: 0,
                    position: "relative",
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "rgba(0,0,0,0)",
                    userSelect: "none",
                  }}
                >
                  {piece && (
                    <span
                      style={{
                        fontSize: Math.round(CELL * 0.5),
                        fontWeight: "bold",
                        lineHeight: 1,
                        transform: (flipped ? piece.color === "black" : piece.color === "white") ? "rotate(180deg)" : undefined,
                        color: piece.promoted ? "#b91c1c" : "#1c1917",
                        userSelect: "none",
                      }}
                    >
                      {pieceLabel(piece)}
                    </span>
                  )}
                  {isHighlight && !piece && (
                    <span
                      style={{
                        position: "absolute",
                        width: 10, height: 10,
                        borderRadius: "50%",
                        backgroundColor: "rgba(22, 163, 74, 0.5)",
                      }}
                    />
                  )}
                </button>
              );
            }),
          )}
        </div>

        {/* 段ラベル */}
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 3 }}>
          {rowLabels.map((label, i) => (
            <div
              key={i}
              style={{
                width: 18, height: CELL,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "#78716c",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
