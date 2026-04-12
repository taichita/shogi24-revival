"use client";

import { useState, useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { OnlineGame } from "@/components/OnlineGame";
import { LobbyTable } from "@/components/LobbyTable";
import { ReviewMode } from "@/components/ReviewMode";
import { getSelectableRanks } from "@shogi24/engine";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3025";

export default function OnlinePage() {
  // トークン処理はuseSocket内で実行
  const {
    connected, loggedIn, needsHandle, kickedMessage, myId, handle, waiting,
    lobbyPlayers, challenges, sentChallenges, match, chatMessages,
    login, setHandleName, sendChallenge, acceptChallenge, declineChallenge, cancelChallenge,
    spectating, spectateMatch, leaveSpectate,
    sendMove, sendResign, sendChat, backToLobby, setLobbyStatus, setPreferredTime,
    reviewMode, reviewMyBoard, reviewOpponentBoard,
    enterReview, sendReviewMove, reviewUndo, reviewReset, leaveReview,
  } = useSocket();

  const [inputHandle, setInputHandle] = useState("");
  const [loginError, setLoginError] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [handleError, setHandleError] = useState("");
  const [selectedRating, setSelectedRating] = useState(1500);
  const [challengeMsg, setChallengeMsg] = useState("");

  const selectableRanks = getSelectableRanks();

  // --- 重複ログインで切断された ---
  if (kickedMessage) {
    return (
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 40, gap: 24, minHeight: "100vh",
      }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold" }}>R24将棋道場</h1>
        <div style={{
          padding: "20px 32px", backgroundColor: "#fef2f2", borderRadius: 12,
          border: "1px solid #fecaca", textAlign: "center",
        }}>
          <p style={{ fontSize: 16, color: "#dc2626", fontWeight: "bold" }}>{kickedMessage}</p>
          <p style={{ fontSize: 13, color: "#78716c", marginTop: 8 }}>
            このページを再読み込みしてください
          </p>
        </div>
      </main>
    );
  }

  // --- 対局中 ---
  if (match) {
    // 感想戦モード
    if (reviewMode && match.result) {
      return (
        <main style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 24, gap: 16, minHeight: "100vh",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: "bold" }}>R24将棋道場</h1>
            <span style={{ fontSize: 13, color: "#78716c" }}>感想戦</span>
          </div>
          <ReviewMode
            myColor={match.myColor}
            myBoard={reviewMyBoard}
            opponentBoard={reviewOpponentBoard}
            onReviewMove={sendReviewMove}
            onUndo={reviewUndo}
            onReset={reviewReset}
            onLeave={leaveReview}
            onBackToLobby={backToLobby}
            chatMessages={chatMessages}
            onSendChat={sendChat}
            myHandle={handle}
            blackHandle={match.blackPlayer.handle}
            whiteHandle={match.whitePlayer.handle}
          />
        </main>
      );
    }

    if (match.game) {
      return (
        <main style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 24, gap: 16, minHeight: "100vh",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: "bold" }}>R24将棋道場</h1>
            <span style={{ fontSize: 13, color: "#78716c" }}>{spectating ? "観戦中" : "オンライン対局"}</span>
          </div>
          <OnlineGame
            match={match} onMove={spectating ? () => {} : sendMove}
            onResign={spectating ? () => {} : sendResign}
            chatMessages={chatMessages} onSendChat={sendChat}
            myHandle={handle} lobbyPlayers={lobbyPlayers} myId={myId}
          />
          {spectating ? (
            <button
              onClick={leaveSpectate}
              style={{
                padding: "10px 24px", fontSize: 15, fontWeight: "bold",
                backgroundColor: "#44403c", color: "white",
                borderRadius: 8, border: "none", cursor: "pointer", marginTop: 8,
              }}
            >
              観戦をやめる
            </button>
          ) : match.result && (
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                onClick={enterReview}
                style={{
                  padding: "10px 24px", fontSize: 15, fontWeight: "bold",
                  backgroundColor: "#d97706", color: "white",
                  borderRadius: 8, border: "none", cursor: "pointer",
                }}
              >
                感想戦
              </button>
              <button
                onClick={backToLobby}
                style={{
                  padding: "10px 24px", fontSize: 15, fontWeight: "bold",
                  backgroundColor: "#44403c", color: "white",
                  borderRadius: 8, border: "none", cursor: "pointer",
                }}
              >
                ロビーに戻る
              </button>
            </div>
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

  // --- ハンドル名設定（Google認証後の初回） ---
  if (needsHandle) {
    return (
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 40, gap: 24, minHeight: "100vh",
      }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold" }}>R24将棋道場</h1>
        <div style={{
          display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
          padding: 32, backgroundColor: "#fafaf9", borderRadius: 12, border: "1px solid #d6d3d1",
          minWidth: 320,
        }}>
          <label style={{ fontSize: 15, fontWeight: "bold" }}>ハンドル名を決めてください</label>
          <p style={{ fontSize: 13, color: "#78716c", textAlign: "center" }}>
            対局で表示される名前です（後から変更できません）
          </p>
          <input
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="ハンドル名（20文字以内）"
            maxLength={20}
            style={{
              padding: "8px 14px", fontSize: 16, borderRadius: 8,
              border: "1px solid #d6d3d1", width: 240, textAlign: "center",
            }}
          />
          <label style={{ fontSize: 14, fontWeight: "bold", marginTop: 8 }}>棋力を選択</label>
          <p style={{ fontSize: 12, color: "#78716c", textAlign: "center" }}>
            あなたの棋力に近い段級を選んでください
          </p>
          <select
            value={selectedRating}
            onChange={(e) => setSelectedRating(Number(e.target.value))}
            style={{
              padding: "8px 14px", fontSize: 15, borderRadius: 8,
              border: "1px solid #d6d3d1", width: 240, textAlign: "center",
            }}
          >
            {selectableRanks.map((r) => (
              <option key={r.rating} value={r.rating}>
                {r.label}（R{r.rating}）
              </option>
            ))}
          </select>
          <button
            disabled={!handleInput.trim()}
            onClick={() => {
              setHandleName(handleInput.trim(), selectedRating).then((res) => {
                if (!res.ok) setHandleError(res.error ?? "設定に失敗しました");
              });
            }}
            style={{
              padding: "10px 24px", fontSize: 16, fontWeight: "bold",
              backgroundColor: handleInput.trim() ? "#44403c" : "#d6d3d1",
              color: "white", borderRadius: 8, border: "none", cursor: "pointer",
            }}
          >
            決定
          </button>
          {handleError && <p style={{ color: "#dc2626", fontSize: 13 }}>{handleError}</p>}
        </div>
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
        <h1 style={{ fontSize: 28, fontWeight: "bold" }}>R24将棋道場</h1>
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
            placeholder="名前を入力"
            maxLength={20}
            style={{
              padding: "8px 14px", fontSize: 16, borderRadius: 8,
              border: "1px solid #d6d3d1", width: 240, textAlign: "center",
            }}
          />
          <label style={{ fontSize: 14, fontWeight: "bold", marginTop: 4 }}>棋力を選択</label>
          <select
            value={selectedRating}
            onChange={(e) => setSelectedRating(Number(e.target.value))}
            style={{
              padding: "8px 14px", fontSize: 15, borderRadius: 8,
              border: "1px solid #d6d3d1", width: 240, textAlign: "center",
            }}
          >
            {selectableRanks.map((r) => (
              <option key={r.rating} value={r.rating}>
                {r.label}（R{r.rating}）
              </option>
            ))}
          </select>
          <button
            disabled={!connected || !inputHandle.trim()}
            onClick={() => {
              login(inputHandle.trim(), selectedRating).then((ok) => {
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
        <div style={{
          display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
          padding: "16px 32px", backgroundColor: "#f0f9ff", borderRadius: 12,
          border: "1px solid #bae6fd", minWidth: 320,
        }}>
          <p style={{ fontSize: 13, color: "#57534e" }}>レーティングを保存するなら</p>
          <button
            onClick={() => { window.location.href = `${SERVER_URL}/auth/google`; }}
            disabled={!connected}
            style={{
              padding: "10px 24px", fontSize: 15, fontWeight: "bold",
              backgroundColor: "#4285f4", color: "white",
              borderRadius: 8, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            Googleでログイン
          </button>
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
        <h1 style={{ fontSize: 22, fontWeight: "bold" }}>R24将棋道場</h1>
        <span style={{ fontSize: 13, color: "#78716c" }}>ロビー</span>
      </div>

      <LobbyTable
        players={lobbyPlayers}
        myId={myId}
        challenges={challenges}
        sentChallenges={sentChallenges}
        onChallenge={async (targetId, timePreset) => {
          const err = await sendChallenge(targetId, timePreset);
          setChallengeMsg(err ?? "挑戦を送りました");
          setTimeout(() => setChallengeMsg(""), 3000);
        }}
        onAccept={acceptChallenge}
        onDecline={declineChallenge}
        onCancel={cancelChallenge}
        onSpectate={async (matchId) => {
          const err = await spectateMatch(matchId);
          if (err) { setChallengeMsg(err); setTimeout(() => setChallengeMsg(""), 3000); }
        }}
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
