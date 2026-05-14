interface HudCornerFrameProps {
  className?: string;
  /** Corner size in pixels (default 24) */
  size?: number;
  /** Stroke opacity 0-1 (default 0.45) */
  opacity?: number;
}

export function HudCornerFrame({ className = "", size = 24, opacity = 0.45 }: HudCornerFrameProps) {
  const stroke = `rgba(34,211,238,${opacity})`;
  const s = size;
  const h = Math.round(s * 0.6);
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* Top-left */}
      <span className="absolute top-2 left-2"
        style={{ borderTop: `2px solid ${stroke}`, borderLeft: `2px solid ${stroke}`, width: s, height: h }} />
      {/* Top-right */}
      <span className="absolute top-2 right-2"
        style={{ borderTop: `2px solid ${stroke}`, borderRight: `2px solid ${stroke}`, width: s, height: h }} />
      {/* Bottom-left */}
      <span className="absolute bottom-2 left-2"
        style={{ borderBottom: `2px solid ${stroke}`, borderLeft: `2px solid ${stroke}`, width: s, height: h }} />
      {/* Bottom-right */}
      <span className="absolute bottom-2 right-2"
        style={{ borderBottom: `2px solid ${stroke}`, borderRight: `2px solid ${stroke}`, width: s, height: h }} />
    </div>
  );
}
