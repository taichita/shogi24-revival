"use client";

import { useState } from "react";
import type { LobbyPlayer, IncomingChallenge } from "@/hooks/useSocket";
import { ratingToRank } from "@shogi24/engine";

const TIME_LABELS: Record<string, string> = {
  normal: "15分+60秒",
  rapid1: "早指し1",
  rapid2: "早指し2",
  long: "長考30分",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "待機中",
  resting: "休憩中",
  automatch: "自動対戦待ち",
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
  challenges: IncomingChallenge[];
  sentChallenges: string[];
  onChallenge: (targetId: string, timePreset: string) => void;
  onAccept: (challengeId: string) => void;
  onDecline: (challengeId: string) => void;
  onCancel: (challengeId: string) => void;
  onSpectate: (matchId: string) => void;
  onSetStatus: (status: "idle" | "resting" | "automatch") => void;
  onSetTime: (preset: string) => void;
  waiting: boolean;
}

export function LobbyTable({
  players, myId, challenges, sentChallenges, onChallenge, onAccept, onDecline, onCancel, onSpectate,
  onSetStatus, onSetTime, waiting,
}: Props) {
  const others = players.filter((p) => p.id !== myId);
  const me = players.find((p) => p.id === myId);
  const myStatus = me?.status ?? "resting";
  const [challengeTargetId, setChallengeTargetId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 720 }}>
      {/* 挑戦通知 */}
      {challenges.length > 0 && (
        <div style={{
          padding: 12, backgroundColor: "#fef3c7", border: "2px solid #f59e0b",
          borderRadius: 10, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {challenges.map((ch) => (
            <div key={ch.challengeId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontWeight: "bold", fontSize: 14 }}>
                {ch.from.handle} ({ratingToRank(ch.from.rating)} R{ch.from.rating}) から挑戦 — {TIME_LABELS[ch.timePreset] ?? ch.timePreset}
              </span>
              <button onClick={() => onAccept(ch.challengeId)} style={actionBtn("#b45309")}>受ける</button>
              <button onClick={() => onDecline(ch.challengeId)} style={actionBtn("#78716c")}>断る</button>
            </div>
          ))}
        </div>
      )}

      {/* 送信済み挑戦（キャンセル可能） */}
      {sentChallenges.length > 0 && (
        <div style={{
          padding: 12, backgroundColor: "#eff6ff", border: "1px solid #93c5fd",
          borderRadius: 10, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {sentChallenges.map((challengeId) => (
            <div key={challengeId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, color: "#1e40af" }}>
                挑戦を送信中...
              </span>
              <button onClick={() => onCancel(challengeId)} style={actionBtn("#6b7280")}>
                キャンセル
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 自分のステータスパネル */}
      <div style={{
        padding: "10px 14px", borderRadius: 10, border: "1px solid #d6d3d1",
        backgroundColor: "#fafaf9", display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: "bold", fontSize: 15 }}>
            {me ? `${me.handle} (${ratingToRank(me.rating)} R${me.rating})` : ""}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: "#78716c" }}>持ち時間:</span>
          <select
            value={me?.preferredTime ?? "normal"}
            onChange={(e) => onSetTime(e.target.value)}
            style={{ fontSize: 13, padding: "3px 8px", borderRadius: 6, border: "1px solid #d6d3d1" }}
          >
            <option value="normal">15分+60秒</option>
            <option value="rapid1">早指し1</option>
            <option value="rapid2">早指し2</option>
            <option value="long">長考30分</option>
          </select>
        </div>

        {/* 3層切り替えボタン */}
        <div style={{ display: "flex", gap: 6 }}>
          <StatusBtn
            label="休憩室"
            desc="対局しない"
            active={myStatus === "resting"}
            onClick={() => onSetStatus("resting")}
            color="#78716c"
          />
          <StatusBtn
            label="待機室"
            desc="挑戦を受付"
            active={myStatus === "idle"}
            onClick={() => onSetStatus("idle")}
            color="#166534"
          />
          <StatusBtn
            label="オートマッチ"
            desc="自動で対戦"
            active={myStatus === "automatch" || waiting}
            onClick={() => onSetStatus("automatch")}
            color="#b45309"
          />
        </div>
      </div>

      {/* 待機者テーブル */}
      <div style={{ border: "1px solid #d6d3d1", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: "#44403c", color: "white" }}>
              <th style={th}>ハンドル</th>
              <th style={th}>レート</th>
              <th style={th}>状態</th>
              <th style={th}>持ち時間</th>
              <th style={{ ...th, width: 240 }}></th>
            </tr>
          </thead>
          <tbody>
            {others.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#a8a29e" }}>
                他のプレイヤーがいません
              </td></tr>
            )}
            {others.map((p) => {
              const sc = STATUS_COLORS[p.status] ?? STATUS_COLORS.resting;
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid #e7e5e4", backgroundColor: "#fafaf9" }}>
                  <td style={td}><span style={{ fontWeight: "bold" }}>{p.handle}</span></td>
                  <td style={{ ...td, fontFamily: "monospace" }}>{ratingToRank(p.rating)} R{p.rating}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 11, padding: "2px 6px", borderRadius: 8,
                      backgroundColor: sc.bg, color: sc.fg,
                    }}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 12 }}>{TIME_LABELS[p.preferredTime] ?? p.preferredTime}</td>
                  <td style={td}>
                    {p.status === "idle" && challengeTargetId !== p.id && (
                      <button
                        onClick={() => setChallengeTargetId(p.id)}
                        style={actionBtn("#44403c")}
                      >
                        挑戦
                      </button>
                    )}
                    {p.status === "idle" && challengeTargetId === p.id && (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {(Object.keys(TIME_LABELS) as (keyof typeof TIME_LABELS)[]).map((preset) => (
                          <button
                            key={preset}
                            onClick={() => {
                              onChallenge(p.id, preset);
                              setChallengeTargetId(null);
                            }}
                            style={{
                              padding: "3px 6px", fontSize: 10, borderRadius: 4,
                              border: "1px solid #d6d3d1",
                              backgroundColor: preset === p.preferredTime ? "#fef3c7" : "#fff",
                              cursor: "pointer",
                            }}
                            title={`${TIME_LABELS[preset]}で挑戦`}
                          >
                            {TIME_LABELS[preset]}
                          </button>
                        ))}
                        <button
                          onClick={() => setChallengeTargetId(null)}
                          style={{
                            padding: "3px 6px", fontSize: 10, borderRadius: 4,
                            border: "1px solid #d6d3d1", backgroundColor: "#f5f5f4",
                            cursor: "pointer",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {p.status === "playing" && p.matchId && (
                      <button
                        onClick={() => onSpectate(p.matchId!)}
                        style={actionBtn("#2563eb")}
                      >
                        観戦
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "#a8a29e" }}>
        {players.length} 人がオンライン
      </div>
    </div>
  );
}

function StatusBtn({ label, desc, active, onClick, color }: {
  label: string; desc: string; active: boolean; onClick: () => void; color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "8px 4px", borderRadius: 8, textAlign: "center",
        border: active ? `2px solid ${color}` : "1px solid #d6d3d1",
        backgroundColor: active ? `${color}18` : "white",
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: "bold", color: active ? color : "#44403c" }}>{label}</div>
      <div style={{ fontSize: 10, color: "#78716c" }}>{desc}</div>
    </button>
  );
}

const th: React.CSSProperties = { padding: "6px 10px", textAlign: "left", fontSize: 12, fontWeight: "bold" };
const td: React.CSSProperties = { padding: "6px 10px" };

function actionBtn(bg: string): React.CSSProperties {
  return {
    padding: "4px 12px", backgroundColor: bg, color: "white",
    borderRadius: 6, fontSize: 12, fontWeight: "bold", border: "none", cursor: "pointer",
  };
}
