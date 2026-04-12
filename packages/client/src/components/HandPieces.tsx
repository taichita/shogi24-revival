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
}

const DISPLAY_ORDER: DroppableKind[] = [
  "rook", "bishop", "gold", "silver", "knight", "lance", "pawn",
];

export function HandPieces({ hand, color, isActive, selection, onSelect, flipped = false, vertical = false }: Props) {
  // flipped時: 相手の駒(上)が回転、自分の駒(下)が正位置
  const shouldRotate = flipped ? color === "black" : color === "white";
  const isWhite = color === "white";
  const selectedKind = selection.type === "drop" ? selection.kind : null;
  const pieces = DISPLAY_ORDER.filter((k) => (hand[k] ?? 0) > 0);

  if (vertical) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          padding: "8px 6px",
          minWidth: 50,
          borderRadius: 8,
          border: "1px solid #d6d3d1",
          backgroundColor: "#fafaf9",
        }}
      >
        <span style={{ fontSize: 11, color: "#78716c", writingMode: "vertical-rl" }}>
          {isWhite ? "☖後手" : "☗先手"}
        </span>
        {pieces.length === 0 && (
          <span style={{ fontSize: 10, color: "#a8a29e" }}>なし</span>
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
                gap: 1,
                padding: "4px 6px",
                borderRadius: 6,
                fontSize: 18,
                fontWeight: "bold",
                cursor: isActive ? "pointer" : "default",
                opacity: isActive ? 1 : 0.5,
                backgroundColor: selected ? "rgba(217, 176, 56, 0.45)" : "#e7e5e4",
                border: selected ? "2px solid #d97706" : "1px solid #d6d3d1",
                transform: shouldRotate ? "rotate(180deg)" : undefined,
              }}
            >
              <span>{handPieceLabel(kind)}</span>
              {count > 1 && (
                <span style={{ fontSize: 10, color: "#57534e" }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isWhite ? "row-reverse" : "row",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        minHeight: 44,
        borderRadius: 8,
        border: "1px solid #d6d3d1",
        backgroundColor: "#fafaf9",
        width: 9 * 44 + 4,
      }}
    >
      <span style={{ fontSize: 13, color: "#78716c", marginRight: 4, whiteSpace: "nowrap" }}>
        {isWhite ? "☖後手" : "☗先手"}
      </span>
      {pieces.length === 0 && (
        <span style={{ fontSize: 12, color: "#a8a29e" }}>なし</span>
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
              gap: 2,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 20,
              fontWeight: "bold",
              cursor: isActive ? "pointer" : "default",
              opacity: isActive ? 1 : 0.5,
              backgroundColor: selected ? "rgba(217, 176, 56, 0.45)" : "#e7e5e4",
              border: selected ? "2px solid #d97706" : "1px solid #d6d3d1",
              transform: shouldRotate ? "rotate(180deg)" : undefined,
            }}
          >
            <span>{handPieceLabel(kind)}</span>
            {count > 1 && (
              <span style={{ fontSize: 12, color: "#57534e" }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
