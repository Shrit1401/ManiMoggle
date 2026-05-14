type ScanSummary = {
  framesAccepted: number;
  framesSkipped:  number;
  headPoseMean:   { yaw: number; pitch: number; roll: number };
  maxSmile:       number;
  maxEye:         number;
};

interface ScanAnalyticsProps {
  summaryJson: string | null;
}

export function ScanAnalytics({ summaryJson }: ScanAnalyticsProps) {
  if (!summaryJson) return null;
  let s: ScanSummary;
  try { s = JSON.parse(summaryJson); } catch { return null; }

  const total        = s.framesAccepted + s.framesSkipped;
  const qualityFrac  = total > 0 ? s.framesAccepted / total : 0;
  const avgPoseDeg   = (Math.abs(s.headPoseMean?.yaw ?? 0) + Math.abs(s.headPoseMean?.roll ?? 0)) / 2;
  const stabilityFrac = Math.max(0, 1 - avgPoseDeg / 25);

  const metrics = [
    { label: "Frames",    frac: qualityFrac,    display: `${s.framesAccepted}/${total}` },
    { label: "Stability", frac: stabilityFrac,  display: (stabilityFrac * 10).toFixed(1) },
    { label: "Smile",     frac: s.maxSmile,     display: (s.maxSmile * 10).toFixed(1) },
    { label: "Eyes",      frac: s.maxEye,       display: (s.maxEye * 10).toFixed(1) },
  ];

  return (
    <div className="w-full flex flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/28 text-center">Scan Quality</p>
      <div className="grid grid-cols-4 gap-2">
        {metrics.map(m => {
          const color = m.frac >= 0.7 ? "#22d3ee" : m.frac >= 0.4 ? "#fbbf24" : "#f87171";
          return (
            <div key={m.label} className="flex flex-col items-center gap-1.5">
              <div className="w-full h-[3px] rounded-full bg-white/8 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round(m.frac * 100)}%`, background: color }} />
              </div>
              <span className="font-mono text-[10px] text-white/35 uppercase tracking-[0.2em] leading-none">{m.label}</span>
              <span className="font-mono text-[10px] tabular-nums leading-none" style={{ color }}>{m.display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
