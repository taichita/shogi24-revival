"use client";

import { useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { OnlineGame } from "@/components/OnlineGame";
import { LobbyTable } from "@/components/LobbyTable";

export default function OnlinePage() {
  const {
    connected, loggedIn, myId, waiting,
    lobbyPlayers, challenges, match,
    login, sendChallenge, acceptChallenge, declineChallenge,
    sendMove, sendResign, backToLobby, setLobbyStatus, setPreferredTime,
  } = useSocket();

  const [inputHandle, setInputHandle] = useState("");
  const [loginError, setLoginError] = useState("");
  const [challengeMsg, setChallengeMsg] = useState("");

  // --- 対局中 ---
  if (match) {
    if (match.game) {
      return (
        <main style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 24, gap: 16, minHeight: "100vh",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: "bold" }}>将棋倶楽部24 Revival</h1>
            <span style={{ fontSize: 13, color: "#78716c" }}>オンライン対局</span>
          </div>
          <OnlineGame match={match} onMove={sendMove} onResign={sendResign} />
          {match.result && (
            <button
              onClick={backToLobby}
              style={{
                marginTop: 8, padding: "10px 24px", fontSize: 15, fontWeight: "bold",
                backgroundColor: "#44403c", color: "white",
                borderRadius: 8, border: "none", cursor: "pointer",
              }}
            >
              ロビーに戻る
            </button>
          )}
        </main>
      );
    }
    // snapshotまだ来てない
    return (
      <main style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh",
      }}>
        <p style={{ fontSize: 18 }}>対局準備中...</p>
      </main>
    );
  }

  // --- ログイン前 ---
  if (!loggedIn) {
    return (
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 40, gap: 24, minHeight: "100vh",
      }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold" }}>将棋倶楽部24 Revival</h1>
        <div style={{ fontSize: 14, color: connected ? "#16a34a" : "#dc2626" }}>
          {connected ? "● サーバー接続中" : "○ 接続中..."}
        </div>
        <div style={{
          display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
          padding: 32, backgroundColor: "#fafaf9", borderRadius: 12, border: "1px solid #d6d3d1",
          minWidth: 320,
        }}>
          <label style={{ fontSize: 15, fontWeight: "bold" }}>ハンドル名</label>
          <input
            value={inputHandle}
            onChange={(e) => setInputHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputHandle.trim()) {
                login(inputHandle.trim()).then((ok) => {
                  if (!ok) setLoginError("ログインに失敗しました");
                });
              }
            }}
            placeholder="名前を入力"
            maxLength={20}
            style={{
              padding: "8px 14px", fontSize: 16, borderRadius: 8,
              border: "1px solid #d6d3d1", width: 240, textAlign: "center",
            }}
          />
          <button
            disabled={!connected || !inputHandle.trim()}
            onClick={() => {
              login(inputHandle.trim()).then((ok) => {
                if (!ok) setLoginError("ログインに失敗しました");
              });
            }}
            style={{
              padding: "10px 24px", fontSize: 16, fontWeight: "bold",
              backgroundColor: connected && inputHandle.trim() ? "#44403c" : "#d6d3d1",
              color: "white", borderRadius: 8, border: "none", cursor: "pointer",
            }}
          >
            入場
          </button>
          {loginError && <p style={{ color: "#dc2626", fontSize: 13 }}>{loginError}</p>}
        </div>
        <a href="/" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
          ローカル対局はこちら
        </a>
      </main>
    );
  }

  // --- ロビー ---
  return (
    <main style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", padding: "24px 16px", gap: 16, minHeight: "100vh",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: "bold" }}>将棋倶楽部24 Revival</h1>
        <span style={{ fontSize: 13, color: "#78716c" }}>ロビー</span>
      </div>

      <LobbyTable
        players={lobbyPlayers}
        myId={myId}
        challenges={challenges}
        onChallenge={async (targetId, timePreset) => {
          const err = await sendChallenge(targetId, timePreset);
          setChallengeMsg(err ?? "挑戦を送りました");
          setTimeout(() => setChallengeMsg(""), 3000);
        }}
        onAccept={acceptChallenge}
        onDecline={declineChallenge}
        onSetStatus={setLobbyStatus}
        onSetTime={setPreferredTime}
        waiting={waiting}
      />

      {challengeMsg && (
        <div style={{
          padding: "8px 16px", borderRadius: 8, fontSize: 14,
          backgroundColor: challengeMsg.includes("失敗") || challengeMsg.includes("できません")
            ? "#fee2e2" : "#dcfce7",
        }}>
          {challengeMsg}
        </div>
      )}

      <a href="/" style={{ fontSize: 13, color: "#78716c", textDecoration: "underline" }}>
        ローカル対局はこちら
      </a>
    </main>
  );
}
