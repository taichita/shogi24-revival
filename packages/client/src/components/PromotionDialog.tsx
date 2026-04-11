"use client";

interface Props {
  onConfirm: (promote: boolean) => void;
}

export function PromotionDialog({ onConfirm }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.35)",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          padding: "32px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          alignItems: "center",
        }}
      >
        <p style={{ fontSize: 20, fontWeight: "bold" }}>成りますか？</p>
        <div style={{ display: "flex", gap: 16 }}>
          <button
            onClick={() => onConfirm(true)}
            style={{
              padding: "10px 32px",
              backgroundColor: "#b91c1c",
              color: "white",
              borderRadius: 10,
              fontSize: 18,
              fontWeight: "bold",
              border: "none",
              cursor: "pointer",
            }}
          >
            成る
          </button>
          <button
            onClick={() => onConfirm(false)}
            style={{
              padding: "10px 32px",
              backgroundColor: "#e7e5e4",
              color: "#1c1917",
              borderRadius: 10,
              fontSize: 18,
              fontWeight: "bold",
              border: "none",
              cursor: "pointer",
            }}
          >
            不成
          </button>
        </div>
      </div>
    </div>
  );
}
