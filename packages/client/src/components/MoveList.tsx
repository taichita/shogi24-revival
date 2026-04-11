"use client";

import { useRef, useEffect, useState } from "react";

interface Props {
  moves: string[];
}

export function MoveList({ moves }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moves.length]);

  const handleCopy = () => {
    const text = moves.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        backgroundColor: "#fafaf9",
        border: "1px solid #d6d3d1",
        borderRadius: 8,
        padding: 12,
        width: 200,
        flex: 1,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: "1px solid #e7e5e4",
        }}
      >
        <h3 style={{ fontSize: 13, fontWeight: "bold", color: "#57534e", margin: 0 }}>
          棋譜
        </h3>
        {moves.length > 0 && (
          <button
            onClick={handleCopy}
            style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 4,
              border: "1px solid #d6d3d1", backgroundColor: copied ? "#d1fae5" : "#fff",
              color: copied ? "#065f46" : "#57534e", cursor: "pointer",
            }}
          >
            {copied ? "コピー済" : "コピー"}
          </button>
        )}
      </div>
      {moves.length === 0 && (
        <p style={{ fontSize: 12, color: "#a8a29e" }}>対局開始を待っています</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 14, fontFamily: "monospace" }}>
        {moves.map((m, i) => (
          <div
            key={i}
            style={{
              padding: "2px 4px",
              borderRadius: 4,
              backgroundColor: i === moves.length - 1 ? "#fef3c7" : "transparent",
              fontWeight: i === moves.length - 1 ? "bold" : "normal",
            }}
          >
            {m}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
