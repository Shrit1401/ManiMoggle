import type { TraitKey } from "../../app/scan/face-rating";

const RADAR_TRAITS: { key: TraitKey; short: string }[] = [
  { key: "symmetry",    short: "SYM" },
  { key: "jawline",     short: "JAW" },
  { key: "canthalTilt", short: "CNT" },
  { key: "goldenRatio", short: "PHI" },
  { key: "skin",        short: "SKN" },
  { key: "harmony",     short: "HAR" },
];

interface RadarChartProps {
  traits: Record<TraitKey, number>;
  size?: number;
}

export function RadarChart({ traits, size = 160 }: RadarChartProps) {
  const cx = size / 2, cy = size / 2, R = Math.round(size * 0.35);
  const N = RADAR_TRAITS.length;
  const angle = (i: number) => (i * 2 * Math.PI) / N - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });
  const poly = (r: number) =>
    Array.from({ length: N }, (_, i) => pt(i, r)).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const traitPoly = () =>
    RADAR_TRAITS.map(({ key }, i) => {
      const r = Math.max(0, (((traits[key] ?? 1) - 1) / 9)) * R;
      return pt(i, r);
    }).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map(level => (
        <polygon key={level} points={poly(R * level)}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {Array.from({ length: N }, (_, i) => {
        const end = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y}
          stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
      })}
      <polygon points={traitPoly()}
        fill="rgba(34,211,238,0.18)" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />
      {RADAR_TRAITS.map(({ key }, i) => {
        const r = Math.max(0, (((traits[key] ?? 1) - 1) / 9)) * R;
        const p = pt(i, r);
        return <circle key={key} cx={p.x} cy={p.y} r={2.5} fill="#22d3ee" />;
      })}
      {RADAR_TRAITS.map(({ key, short }, i) => {
        const p = pt(i, R + 14);
        const val = traits[key] ?? 1;
        return (
          <text key={key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill={val >= 7 ? "#22d3ee" : val >= 5 ? "#fbbf24" : "rgba(255,255,255,0.35)"}
            fontSize="6.5" fontFamily="monospace" fontWeight="bold">
            {short}
          </text>
        );
      })}
      {RADAR_TRAITS.map(({ key }, i) => {
        const val = traits[key] ?? 1;
        if (val < 7) return null;
        const r = Math.max(0, ((val - 1) / 9)) * R;
        const p = pt(i, r);
        return (
          <text key={`v-${key}`} x={p.x} y={p.y - 5} textAnchor="middle"
            fill="rgba(34,211,238,0.75)" fontSize="5.5" fontFamily="monospace">
            {val.toFixed(1)}
          </text>
        );
      })}
    </svg>
  );
}
