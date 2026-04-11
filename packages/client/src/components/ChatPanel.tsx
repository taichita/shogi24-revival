"use client";

import { useRef, useEffect, useState } from "react";

export interface ChatMessage {
  sender: string;
  message: string;
  timestamp: number;
}

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  myHandle: string | null;
}

export function ChatPanel({ messages, onSend, myHandle }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (text.length === 0) return;
    onSend(text);
    setInput("");
  };

  return (
    <div
      style={{
        backgroundColor: "#fafaf9",
        border: "1px solid #d6d3d1",
        borderRadius: 8,
        padding: 12,
        width: 200,
        display: "flex",
        flexDirection: "column",
        height: 200,
      }}
    >
      <h3
        style={{
          fontSize: 13,
          fontWeight: "bold",
          color: "#57534e",
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: "1px solid #e7e5e4",
          margin: 0,
        }}
      >
        チャット
      </h3>
      <div style={{ flex: 1, overflowY: "auto", marginTop: 8, marginBottom: 8 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 11, color: "#a8a29e" }}>メッセージはまだありません</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ fontSize: 12, marginBottom: 4, wordBreak: "break-word" }}>
            <span style={{ fontWeight: m.sender === myHandle ? "bold" : "normal", color: m.sender === myHandle ? "#1c1917" : "#57534e" }}>
              {m.sender}:
            </span>{" "}
            {m.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          maxLength={200}
          placeholder="メッセージ..."
          style={{
            flex: 1, padding: "4px 8px", fontSize: 12, borderRadius: 4,
            border: "1px solid #d6d3d1", outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          style={{
            padding: "4px 8px", fontSize: 12, borderRadius: 4,
            border: "1px solid #d6d3d1", backgroundColor: "#44403c",
            color: "#fff", cursor: "pointer",
          }}
        >
          送信
        </button>
      </div>
    </div>
  );
}
