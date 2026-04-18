"use client";

import type { Hand, Color, DroppableKind } from "@shogi24/engine";
import type { SelectionState } from "@/hooks/useGame";
import { handPieceLabel } from "@/lib/piece-label";

interface Props {
  hand: Hand;
  color: Color;
  isActive: boolean;
  selection: SelectionState;
  onSelect: (kind: DroppableKind) => void;
  flipped?: boolean;
  vertical?: boolean;
  cellSize?: number;
}

const DISPLAY_ORDER: DroppableKind[] = [
  "rook", "bishop", "gold", "silver", "knight", "lance", "pawn",
];

export function HandPieces({
  hand, color, isActive, selection, onSelect,
  flipped = false, vertical = false, cellSize = 44,
}: Props) {
  const shouldRotate = flipped ? color === "black" : color === "white";
  const isWhite = color === "white";
  const selectedKind = selection.type === "drop" ? selection.kind : null;
  const pieces = DISPLAY_ORDER.filter((k) => (hand[k] ?? 0) > 0);

  // サイズをセルサイズに比例させる（盤と揃える）
  const trayPad = Math.max(2, Math.round(cellSize * 0.08));
  const pieceSize = cellSize - 2;
  const pieceFont = Math.round(cellSize * 0.48);
  const countFont = Math.round(cellSize * 0.26);
  const labelFont = Math.max(9, Math.round(cellSize * 0.24));

  if (vertical) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          padding: `${trayPad}px ${trayPad}px`,
          width: cellSize + 6,
          borderRadius: 4,
          border: "1px solid #a16207",
          backgroundColor: "#fef3c7",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        }}
      >
        <span style={{
          fontSize: labelFont, color: "#92400e", fontWeight: "bold",
          writingMode: "vertical-rl", marginBottom: 2,
        }}>
          {isWhite ? "☖後" : "☗先"}
        </span>
        {pieces.length === 0 && (
          <span style={{ fontSize: labelFont, color: "#a16207" }}>—</span>
        )}
        {pieces.map((kind) => {
          const count = hand[kind] ?? 0;
          const selected = selectedKind === kind;
          return (
            <button
              key={kind}
              disabled={!isActive}
              onClick={() => onSelect(kind)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0,
                padding: 0,
                width: pieceSize,
                height: pieceSize,
                borderRadius: 3,
                fontSize: pieceFont,
                fontWeight: "bold",
                lineHeight: 1,
                cursor: isActive ? "pointer" : "default",
                opacity: isActive ? 1 : 0.6,
                backgroundColor: selected ? "rgba(217, 119, 6, 0.35)" : "#dbb87a",
                border: selected ? "2px solid #b45309" : "1px solid #a16207",
                transform: shouldRotate ? "rotate(180deg)" : undefined,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "rgba(0,0,0,0)",
                userSelect: "none",
                position: "relative",
              }}
            >
              <span>{handPieceLabel(kind)}</span>
              {count > 1 && (
                <span style={{
                  position: "absolute", right: 1, bottom: -2,
                  fontSize: countFont, color: "#57534e", fontWeight: "bold",
                  lineHeight: 1, transform: shouldRotate ? "rotate(180deg)" : undefined,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // 横並び: 盤幅と揃える
  const boardW = 9 * cellSize + 4;
  const trayH = cellSize + trayPad * 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isWhite ? "row-reverse" : "row",
        alignItems: "center",
        gap: 4,
        padding: `${trayPad}px ${trayPad + 4}px`,
        height: trayH,
        width: boardW,
        borderRadius: 4,
        border: "1px solid #a16207",
        backgroundColor: "#fef3c7",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <span style={{
        fontSize: labelFont, color: "#92400e", fontWeight: "bold",
        whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {isWhite ? "☖後" : "☗先"}
      </span>
      {pieces.length === 0 && (
        <span style={{ fontSize: labelFont, color: "#a16207" }}>—</span>
      )}
      {pieces.map((kind) => {
        const count = hand[kind] ?? 0;
        const selected = selectedKind === kind;
        return (
          <button
            key={kind}
            disabled={!isActive}
            onClick={() => onSelect(kind)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              width: pieceSize,
              height: pieceSize,
              borderRadius: 3,
              fontSize: pieceFont,
              fontWeight: "bold",
              lineHeight: 1,
              cursor: isActive ? "pointer" : "default",
              opacity: isActive ? 1 : 0.6,
              backgroundColor: selected ? "rgba(217, 119, 6, 0.35)" : "#dbb87a",
              border: selected ? "2px solid #b45309" : "1px solid #a16207",
              transform: shouldRotate ? "rotate(180deg)" : undefined,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "rgba(0,0,0,0)",
              userSelect: "none",
              flexShrink: 0,
              position: "relative",
            }}
          >
            <span>{handPieceLabel(kind)}</span>
            {count > 1 && (
              <span style={{
                position: "absolute", right: 1, bottom: -2,
                fontSize: countFont, color: "#57534e", fontWeight: "bold",
                lineHeight: 1, transform: shouldRotate ? "rotate(180deg)" : undefined,
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
