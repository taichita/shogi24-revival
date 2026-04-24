"use client";

import { useState } from "react";
import type { Move, GameResult } from "@shogi24/engine";
import { toKifString } from "@shogi24/engine";

interface Props {
  moves: Move[];
  blackName: string;
  whiteName: string;
  result?: GameResult | null;
  timePreset?: string;
  startDate?: string;
  style?: React.CSSProperties;
  compact?: boolean; // trueでサイズ小さめ（モバイル用）
  label?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export function KifCopyButton({
  moves, blackName, whiteName, result, timePreset, startDate,
  style, compact, label,
}: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const onClick = async () => {
    const kif = toKifString(moves, {
      blackName, whiteName,
      result: result ?? null,
      timePreset, startDate,
    });
    const ok = await copyText(kif);
    setStatus(ok ? "copied" : "failed");
    setTimeout(() => setStatus("idle"), 1500);
  };

  const base: React.CSSProperties = compact
    ? {
        padding: "4px 8px", fontSize: 11, borderRadius: 4,
        border: "1px solid #d6d3d1", backgroundColor: "#f5f5f4", color: "#1c1917",
        cursor: "pointer", fontWeight: "bold", minHeight: 32,
      }
    : {
        padding: "4px 10px", fontSize: 12, borderRadius: 6,
        border: "1px solid #d6d3d1", backgroundColor: "#f5f5f4", color: "#1c1917",
        cursor: "pointer", fontWeight: "bold",
      };

  const text =
    status === "copied" ? "✓コピー済" :
    status === "failed" ? "失敗" :
    (label ?? "KIFコピー");

  return (
    <button onClick={onClick} title="棋譜をKIF形式でクリップボードにコピー" style={{ ...base, ...style }}>
      {text}
    </button>
  );
}
