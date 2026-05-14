"use client";

import { forwardRef } from "react";
import type { Scores } from "../../app/scan/face-rating";

interface ScoreCardProps {
  scores: Scores;
  name: string;
}

const RADAR_KEYS = ["symmetry", "jawline", "canthalTilt", "goldenRatio", "skin", "harmony"] as const;
const RADAR_LABELS = ["SYM", "JAW", "CNT", "PHI", "SKN", "HAR"];

function CardRadar({ traits }: { traits: Record<string, number> }) {
  const size = 160, cx = 80, cy = 80, R = 54;
  const N = RADAR_KEYS.length;
  const angle = (i: number) => (i * 2 * Math.PI) / N - Math.PI / 2;
  const pt    = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });
  const ring = (level: number) =>
    Array.from({ length: N }, (_, i) => pt(i, R * level))
      .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const filled = RADAR_KEYS
    .map((k, i) => {
      const r = Math.max(0, ((traits[k] ?? 1) - 1) / 9) * R;
      return pt(i, r);
    })
    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map(l => (
        <polygon key={l} points={ring(l)} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      ))}
      {Array.from({ length: N }, (_, i) => {
        const e = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={e.x} y2={e.y} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />;
      })}
      <polygon points={filled} fill="rgba(34,211,238,0.2)" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />
      {RADAR_KEYS.map((k, i) => {
        const r = Math.max(0, ((traits[k] ?? 1) - 1) / 9) * R;
        const p = pt(i, r);
        return <circle key={k} cx={p.x} cy={p.y} r={2.5} fill="#22d3ee" />;
      })}
      {RADAR_KEYS.map((_, i) => {
        const p = pt(i, R + 15);
        const val = traits[RADAR_KEYS[i]] ?? 1;
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill={val >= 7 ? "#22d3ee" : val >= 5 ? "#fbbf24" : "rgba(255,255,255,0.35)"}
            fontSize="7" fontFamily="monospace" fontWeight="bold">
            {RADAR_LABELS[i]}
          </text>
        );
      })}
    </svg>
  );
}

export const ScoreCard = forwardRef<HTMLDivElement, ScoreCardProps>(
  function ScoreCard({ scores, name }, ref) {
    const tierClr = scores.tier.starColor;

    return (
      <div
        ref={ref}
        style={{
          width: 390,
          height: 720,
          background: "linear-gradient(160deg, #050a0e 0%, #000000 60%, #030d10 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "48px 32px 36px",
          gap: 0,
          fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', monospace",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Background grid lines */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.04 }}>
          {Array.from({ length: 12 }, (_, i) => (
            <line key={`v${i}`} x1={i * 34} y1={0} x2={i * 34} y2={720} stroke="#22d3ee" strokeWidth="1" />
          ))}
          {Array.from({ length: 22 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 34} x2={390} y2={i * 34} stroke="#22d3ee" strokeWidth="1" />
          ))}
        </svg>

        {/* Cyan top ambient */}
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 300, height: 180,
          background: "radial-gradient(ellipse, rgba(34,211,238,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* App name */}
        <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "rgba(34,211,238,0.6)", textTransform: "uppercase", marginBottom: 32, zIndex: 1 }}>
          MANIMOGGLE
        </div>

        {/* Player name */}
        <div style={{ fontSize: 13, letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 8, zIndex: 1 }}>
          {name}
        </div>

        {/* Score label */}
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", marginBottom: 4, zIndex: 1 }}>
          PSL SCORE
        </div>

        {/* Big score */}
        <div style={{
          fontSize: 92, fontWeight: 900, color: "#22d3ee", lineHeight: 1,
          textShadow: `0 0 60px ${tierClr}66`,
          fontFamily: "'ui-sans-serif', system-ui, sans-serif",
          zIndex: 1, marginBottom: 8,
        }}>
          {scores.overall.toFixed(1)}
        </div>

        {/* Tier + level */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, zIndex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", color: tierClr }}>
            ★ {scores.tier.code}
          </span>
          <span style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
            {scores.level}
          </span>
        </div>

        {/* Sub | ELO */}
        <div style={{
          display: "flex", overflow: "hidden", borderRadius: 9999,
          border: "1px solid rgba(255,255,255,0.15)", marginBottom: 24, zIndex: 1,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 14px", fontSize: 10, fontWeight: 700, color: "white", letterSpacing: "0.1em",
            background: "linear-gradient(135deg, rgba(249,115,22,0.85), rgba(245,158,11,0.75))",
          }}>
            <span style={{ fontSize: 12 }}>🌹</span>
            <span>{scores.sub}</span>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.15)", alignSelf: "stretch" }} />
          <div style={{
            display: "flex", alignItems: "center",
            padding: "6px 14px", fontSize: 10, fontWeight: 700, color: "white", letterSpacing: "0.1em",
            background: "linear-gradient(135deg, rgba(34,211,238,0.75), rgba(14,165,233,0.8))",
          }}>
            {scores.elo} ELO
          </div>
        </div>

        {/* Radar */}
        <div style={{ zIndex: 1, marginBottom: 20 }}>
          <CardRadar traits={scores.traits as Record<string, number>} />
        </div>

        {/* DOM / FLAW */}
        <div style={{ display: "flex", gap: 28, marginBottom: 24, zIndex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 8, letterSpacing: "0.25em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>Dominant</span>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "#34d399" }}>{scores.dom.label}</span>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.1)", alignSelf: "stretch" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 8, letterSpacing: "0.25em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>Weakness</span>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "#fb7185" }}>{scores.flaw.label}</span>
          </div>
        </div>

        {/* Badges */}
        {(scores.badges ?? []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 20, zIndex: 1 }}>
            {(scores.badges ?? []).slice(0, 4).map(b => (
              <span key={b.id} style={{
                fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase",
                padding: "4px 10px", borderRadius: 9999,
                color: b.color, border: `1px solid ${b.color}50`, background: `${b.color}18`,
              }}>
                {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Bottom branding */}
        <div style={{ marginTop: "auto", fontSize: 8, letterSpacing: "0.28em", color: "rgba(255,255,255,0.18)", textTransform: "uppercase", zIndex: 1 }}>
          manimoggle.app
        </div>
      </div>
    );
  }
);
