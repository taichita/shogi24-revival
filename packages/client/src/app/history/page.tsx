"use client";

import { useState, useEffect } from "react";
import { ratingToRank } from "@shogi24/engine";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3025";

interface UserResult {
  id: string;
  handle: string;
  rating: number;
  games: number;
  wins: number;
  isGuest?: boolean;
  userNumber?: number;
}

interface MatchRecord {
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

const RESULT_LABELS: Record<string, string> = {
  checkmate: "詰み",
  resign: "投了",
  timeout: "時間切れ",
  disconnect: "切断",
};

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const viewportW = useViewportWidth();
  const isMobile = viewportW < 700;

  const handleSearch = async () => {
    const q = query.trim();
    if (q.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.users ?? []);
      setSelectedUser(null);
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async (user: UserResult) => {
    setSelectedUser(user);
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/users/${user.id}/matches`);
      const data = await res.json();
      setMatches(data.matches ?? []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      flex: 1, display: "flex", flexDirection: "column",
      padding: isMobile ? "12px 8px" : "24px 16px",
      gap: 12, minHeight: "100vh", maxWidth: 960, margin: "0 auto", width: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: "bold" }}>R24将棋道場</h1>
        <span style={{ fontSize: 12, color: "#78716c" }}>戦績検索</span>
      </div>

      {/* 検索ボックス */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="ハンドル名 または 登録番号で検索"
          style={{
            flex: 1, padding: "8px 12px", fontSize: 14, borderRadius: 6,
            border: "1px solid #d6d3d1", outline: "none", minWidth: 0,
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            padding: "8px 16px", fontSize: 14, fontWeight: "bold",
            backgroundColor: "#44403c", color: "white",
            borderRadius: 6, border: "none", cursor: "pointer",
          }}
        >
          検索
        </button>
      </div>

      {loading && <p style={{ fontSize: 12, color: "#78716c" }}>読み込み中...</p>}

      {/* 検索結果（ユーザー一覧） */}
      {!selectedUser && searchResults.length > 0 && (
        <div style={{
          border: "1px solid #d6d3d1", borderRadius: 8,
          backgroundColor: "#fafaf9", overflow: "hidden",
        }}>
          {searchResults.map((u) => (
            <button
              key={u.id}
              onClick={() => loadMatches(u)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "10px 14px", fontSize: 14,
                border: "none", borderBottom: "1px solid #e7e5e4",
                backgroundColor: "#fff", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontWeight: "bold", flex: 1 }}>
                {u.userNumber != null && (
                  <span style={{ color: "#78716c", fontSize: 12, marginRight: 6, fontFamily: "monospace" }}>
                    #{u.userNumber}
                  </span>
                )}
                {u.handle}
                {u.isGuest && (
                  <span style={{
                    marginLeft: 6, fontSize: 10, padding: "1px 5px",
                    borderRadius: 4, backgroundColor: "#e7e5e4", color: "#78716c",
                  }}>ゲスト</span>
                )}
              </span>
              <span style={{ fontSize: 13, color: "#57534e", fontFamily: "monospace" }}>
                {ratingToRank(u.rating)} R{u.rating}
              </span>
              <span style={{ fontSize: 12, color: "#78716c" }}>
                {u.games}局 {u.wins}勝
              </span>
            </button>
          ))}
        </div>
      )}

      {!selectedUser && searchResults.length === 0 && query.length > 0 && !loading && (
        <p style={{ fontSize: 13, color: "#78716c" }}>該当ユーザーが見つかりませんでした</p>
      )}

      {/* 選択ユーザーの対局履歴 */}
      {selectedUser && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", backgroundColor: "#fef3c7",
            borderRadius: 8, border: "1px solid #fde68a",
          }}>
            <button
              onClick={() => setSelectedUser(null)}
              style={{
                fontSize: 12, padding: "4px 10px", borderRadius: 4,
                border: "1px solid #d6d3d1", backgroundColor: "#fff", cursor: "pointer",
              }}
            >
              ← 戻る
            </button>
            <span style={{ fontSize: 16, fontWeight: "bold" }}>
              {selectedUser.userNumber != null && (
                <span style={{ color: "#78716c", fontSize: 13, marginRight: 6, fontFamily: "monospace" }}>
                  #{selectedUser.userNumber}
                </span>
              )}
              {selectedUser.handle}
              {selectedUser.isGuest && (
                <span style={{
                  marginLeft: 6, fontSize: 10, padding: "1px 5px",
                  borderRadius: 4, backgroundColor: "#e7e5e4", color: "#78716c",
                }}>ゲスト</span>
              )}
            </span>
            <span style={{ fontSize: 13, color: "#57534e", fontFamily: "monospace" }}>
              {ratingToRank(selectedUser.rating)} R{selectedUser.rating}
            </span>
            <span style={{ fontSize: 12, color: "#78716c", marginLeft: "auto" }}>
              {selectedUser.games}局 {selectedUser.wins}勝
              {selectedUser.games > 0 && ` (${((selectedUser.wins / selectedUser.games) * 100).toFixed(1)}%)`}
            </span>
          </div>

          {matches.length === 0 && !loading && (
            <p style={{ fontSize: 13, color: "#78716c" }}>対局記録がありません</p>
          )}

          {matches.length > 0 && (
            <div style={{
              border: "1px solid #d6d3d1", borderRadius: 8,
              backgroundColor: "#fafaf9", overflow: "hidden",
            }}>
              {matches.map((m) => {
                const isBlack = m.blackId === selectedUser.id;
                const myHandle = isBlack ? m.blackHandle : m.whiteHandle;
                const oppHandle = isBlack ? m.whiteHandle : m.blackHandle;
                const myRating = isBlack ? m.blackRating : m.whiteRating;
                const oppRating = isBlack ? m.whiteRating : m.blackRating;
                const isWin = m.winnerId === selectedUser.id;
                const isDraw = !m.winnerId;
                const date = new Date(m.createdAt + "Z").toLocaleString("ja-JP", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                });
                return (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", borderBottom: "1px solid #e7e5e4",
                    backgroundColor: "#fff", fontSize: 12,
                    flexWrap: "wrap",
                  }}>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: "bold",
                      backgroundColor: isDraw ? "#f5f5f4" : (isWin ? "#dcfce7" : "#fee2e2"),
                      color: isDraw ? "#78716c" : (isWin ? "#166534" : "#991b1b"),
                      minWidth: 36, textAlign: "center",
                    }}>
                      {isDraw ? "分" : (isWin ? "勝" : "負")}
                    </span>
                    <span style={{ fontSize: 11, color: "#78716c" }}>
                      {isBlack ? "☗先手" : "☖後手"}
                    </span>
                    <span style={{ flex: 1, minWidth: 100 }}>
                      vs <b>{oppHandle ?? "(不明)"}</b> <span style={{ color: "#78716c", fontFamily: "monospace" }}>R{oppRating}</span>
                    </span>
                    <span style={{ fontSize: 11, color: "#57534e" }}>
                      {RESULT_LABELS[m.result] ?? m.result} / {m.moves}手 / {m.timePreset}
                    </span>
                    <span style={{ fontSize: 11, color: "#57534e", fontFamily: "monospace" }}>
                      R{myRating} {m.ratingDelta > 0 ? (isWin ? `+${m.ratingDelta}` : `-${m.ratingDelta}`) : "±0"}
                    </span>
                    <span style={{ fontSize: 11, color: "#a8a29e", marginLeft: "auto" }}>
                      {date}
                    </span>
                    <a href={`/kifu/${m.id}`}
                      style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 4,
                        backgroundColor: "#44403c", color: "white", fontWeight: "bold",
                        textDecoration: "none",
                      }}>
                      棋譜再生
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
        <a href="/online" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
          オンライン対局
        </a>
        <a href="/" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
          ローカル対局
        </a>
      </div>
    </main>
  );
}
