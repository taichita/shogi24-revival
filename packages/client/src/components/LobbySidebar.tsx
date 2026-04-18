"use client";

import type { LobbyPlayer } from "@/hooks/useSocket";
import { ratingToRank } from "@shogi24/engine";

const STATUS_LABELS: Record<string, string> = {
  idle: "待機",
  resting: "休憩",
  automatch: "自動待",
  playing: "対局中",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  idle: { bg: "#dcfce7", fg: "#166534" },
  resting: { bg: "#f3f4f6", fg: "#6b7280" },
  automatch: { bg: "#fef9c3", fg: "#854d0e" },
  playing: { bg: "#fee2e2", fg: "#991b1b" },
};

interface Props {
  players: LobbyPlayer[];
  myId: string | null;
}

export function LobbySidebar({ players, myId }: Props) {
  const others = players.filter((p) => p.id !== myId);

  return (
    <div
      style={{
        width: 180,
        backgroundColor: "#fafaf9",
        border: "1px solid #d6d3d1",
        borderRadius: 8,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
      }}
    >
      <h3 style={{
        fontSize: 12, fontWeight: "bold", color: "#57534e",
        margin: 0, paddingBottom: 6, borderBottom: "1px solid #e7e5e4",
      }}>
        ロビー ({players.length}人)
      </h3>
      <div style={{ flex: 1, overflowY: "auto", marginTop: 6 }}>
        {others.length === 0 && (
          <p style={{ fontSize: 11, color: "#a8a29e", textAlign: "center" }}>
            他のプレイヤーなし
          </p>
        )}
        {others.map((p) => {
          const sc = STATUS_COLORS[p.status] ?? STATUS_COLORS.resting;
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 4px",
                fontSize: 11,
                borderBottom: "1px solid #f5f5f4",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: "bold", fontSize: 12 }}>
                  {p.handle}
                  {p.isGuest && (
                    <span style={{
                      marginLeft: 3, fontSize: 8, padding: "1px 3px",
                      borderRadius: 3, backgroundColor: "#e7e5e4", color: "#78716c",
                    }}>G</span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: "#78716c", fontFamily: "monospace" }}>
                  {ratingToRank(p.rating)} R{p.rating}
                </span>
              </div>
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 4px",
                  borderRadius: 6,
                  backgroundColor: sc.bg,
                  color: sc.fg,
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_LABELS[p.status]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
