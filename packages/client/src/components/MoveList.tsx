"use client";

import { useRef, useEffect, useState } from "react";

interface Props {
  moves: string[];
  collapsedMax?: number;
}

export function MoveList({ moves, collapsedMax = 10 }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 新しい手が来たら自動で下までスクロール（親の内部スクロールのみ、ページ全体はスクロールしない）
  useEffect(() => {
    if (!expanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [moves.length, expanded]);

  const handleCopy = () => {
    const text = moves.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shouldCollapse = moves.length > collapsedMax && !expanded;
  const displayMoves = shouldCollapse ? moves.slice(-collapsedMax) : moves;

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
        display: "flex",
        flexDirection: "column",
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

      {/* 折りたたみ時: 「全て表示」ボタン */}
      {shouldCollapse && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontSize: 11, padding: "3px 8px", marginBottom: 4,
            borderRadius: 4, border: "1px solid #d6d3d1",
            backgroundColor: "#f5f5f4", color: "#78716c",
            cursor: "pointer", textAlign: "center",
          }}
        >
          ▲ 全{moves.length}手を表示
        </button>
      )}

      {/* 展開時: 「折りたたむ」ボタン */}
      {expanded && moves.length > collapsedMax && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            fontSize: 11, padding: "3px 8px", marginBottom: 4,
            borderRadius: 4, border: "1px solid #d6d3d1",
            backgroundColor: "#f5f5f4", color: "#78716c",
            cursor: "pointer", textAlign: "center",
          }}
        >
          ▼ 最新{collapsedMax}手のみ表示
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 14, fontFamily: "monospace" }}>
        {displayMoves.map((m, i) => {
          const actualIndex = shouldCollapse ? moves.length - collapsedMax + i : i;
          const isLast = actualIndex === moves.length - 1;
          return (
            <div
              key={actualIndex}
              style={{
                padding: "2px 4px",
                borderRadius: 4,
                backgroundColor: isLast ? "#fef3c7" : "transparent",
                fontWeight: isLast ? "bold" : "normal",
              }}
            >
              {m}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
