// PSL face-rating engine — 5 sub-scores matching Omoggle methodology

export type TraitKey =
  | "canthalTilt"   // Eye area / hunter eyes
  | "symmetry"      // Bilateral facial symmetry
  | "jawline"       // Mandible definition / gonial angle
  | "harmony"       // Facial thirds, lips, FWHR, eye spacing combined
  | "skin";         // Skin quality, texture, and lighting

export type Scores = {
  overall: number;
  dom:  { label: string; value: number };
  flaw: { label: string; value: number };
  elo:  number;
  sub:  "SUB1" | "SUB2" | "SUB3" | "SUB4" | "SUB5";
  tier: { code: "LTN" | "MTN" | "HTN"; starColor: string };
  level: string;
  traits: Record<TraitKey, number>;
};

type LM = { x: number; y: number; z: number };

function dist(a: LM, b: LM): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function angleDeg(a: LM, vertex: LM, b: LM): number {
  const v1x = a.x - vertex.x, v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x, v2y = b.y - vertex.y;
  const dot  = v1x * v2x + v1y * v2y;
  const mag  = Math.sqrt(v1x ** 2 + v1y ** 2) * Math.sqrt(v2x ** 2 + v2y ** 2);
  if (mag === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Roll-correction ──────────────────────────────────────────────────────────

export function rollCorrect(lm: LM[]): LM[] {
  const dx    = lm[263].x - lm[33].x;
  const dy    = lm[263].y - lm[33].y;
  const angle = Math.atan2(dy, dx);
  const cos   = Math.cos(-angle);
  const sin   = Math.sin(-angle);
  const cx    = (lm[33].x + lm[263].x) / 2;
  const cy    = (lm[33].y + lm[263].y) / 2;
  return lm.map((p) => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
    z: p.z,
  }));
}

// ─── 1. Canthal Tilt — Eye Area ───────────────────────────────────────────────
// Angle from inner to outer eye corner. Positive tilt (outer > inner) = hunter eyes.

function canthalTiltScore(lm: LM[]): number {
  const fw = dist(lm[234], lm[454]);
  if (fw === 0) return 4.5;
  const leftTilt  = (lm[133].y - lm[33].y)  / fw;
  const rightTilt = (lm[362].y - lm[263].y) / fw;
  // Neutral/flat face ≈ 4.5 baseline; positive tilt pushes high
  return clamp(4.5 + ((leftTilt + rightTilt) / 2) * 230, 1, 10);
}

// ─── 2. Symmetry ─────────────────────────────────────────────────────────────

function symmetryScore(lm: LM[]): number {
  const fw = dist(lm[234], lm[454]);
  if (fw === 0) return 5.5;
  const midX = (lm[1].x + lm[152].x) / 2;
  const pairs: [number, number][] = [[33,263],[133,362],[61,291],[172,397],[234,454]];
  let dev = 0;
  for (const [l, r] of pairs) dev += Math.abs(midX - lm[l].x - (lm[r].x - midX)) / fw;
  return clamp(10 - (dev / pairs.length) * 260, 1, 10);
}

// ─── 3. Jawline ───────────────────────────────────────────────────────────────

function jawlineScore(lm: LM[]): number {
  const l = angleDeg(lm[234], lm[172], lm[152]);
  const r = angleDeg(lm[454], lm[397], lm[152]);
  return clamp(9.5 - Math.abs((l + r) / 2 - 112) / 3.2, 1, 10);
}

// ─── 4. Harmony — combined facial proportion sub-score ────────────────────────
// Weights: midface thirds 35%, lips 25%, FWHR 25%, interocular 15%

function midfaceRaw(lm: LM[]): number {
  const upper = Math.abs(lm[1].y - lm[6].y);
  const lower = Math.abs(lm[152].y - lm[1].y);
  if (lower === 0) return 5.5;
  return clamp(9.5 - Math.abs(upper / lower - 0.85) * 16, 1, 10);
}

function lipHarmonyRaw(lm: LM[]): number {
  const fw       = dist(lm[234], lm[454]);
  if (fw === 0) return 5.5;
  const lipH     = dist(lm[13], lm[14]);
  const mouthW   = dist(lm[61], lm[291]);
  const lipScore   = clamp(9.5 - Math.abs(lipH / fw - 0.04) * 55, 1, 10);
  const mouthScore = clamp(9.5 - Math.abs(mouthW / fw - 0.39) * 20, 1, 10);
  return lipScore * 0.5 + mouthScore * 0.5;
}

function fwhrRaw(lm: LM[]): number {
  const fwNorm = Math.abs(lm[454].x - lm[234].x);
  const fhNorm = Math.abs(lm[152].y - lm[10].y);
  if (fhNorm === 0) return 5.5;
  const fwhr = (fwNorm / fhNorm) * (16 / 9);
  return clamp(9.0 - Math.abs(fwhr - 2.0) * 4.0, 1, 10);
}

function interocularRaw(lm: LM[]): number {
  const fw = dist(lm[234], lm[454]);
  if (fw === 0) return 5.5;
  return clamp(9.5 - Math.abs(dist(lm[33], lm[263]) / fw - 0.56) * 22, 1, 10);
}

function harmonyScore(lm: LM[]): number {
  return clamp(
    midfaceRaw(lm)     * 0.35 +
    lipHarmonyRaw(lm)  * 0.25 +
    fwhrRaw(lm)        * 0.25 +
    interocularRaw(lm) * 0.15,
    1, 10,
  );
}

// ─── 5. Skin — lighting quality proxy ────────────────────────────────────────
// Real skin texture can't be read from landmarks; AI provides the real value.
// For live preview we use luma as a proxy.

function skinScore(luma?: number): number {
  if (luma === undefined) return 6.2; // neutral baseline
  if (luma < 40)  return 3.8;
  if (luma < 80)  return 5.2;
  if (luma < 120) return 6.0;
  if (luma < 160) return 7.0;
  if (luma < 200) return 7.5;
  if (luma < 228) return 6.8; // slight overexposure
  return 5.5;                 // blown out
}

// ─── Label tables ─────────────────────────────────────────────────────────────

const DOM_LABELS: Record<TraitKey, [string, string, string]> = {
  canthalTilt: ["Hunter Eyes",           "Positive Canthal Tilt", "Slight PCT"],
  symmetry:    ["Near-Perfect Symmetry", "High Bilateral Symmetry", "Good Balance"],
  jawline:     ["Defined Gonial Angle",  "Sharp Mandible",          "Solid Jawline"],
  harmony:     ["Perfect Facial Harmony","High PSL Harmony",        "Good Proportions"],
  skin:        ["Flawless Complexion",   "Clear Glowing Skin",      "Above-Avg Skin"],
};

const FLAW_LABELS: Record<TraitKey, [string, string, string]> = {
  canthalTilt: ["Prey Eyes",           "Negative Canthal Tilt", "Mild NCT"],
  symmetry:    ["Facial Asymmetry",    "Bilateral Deviation",   "Minor Asymmetry"],
  jawline:     ["Recessed Mandible",   "Weak Gonial Angle",     "Soft Jawline"],
  harmony:     ["Poor Facial Harmony", "Low PSL Harmony",       "Disharmonious Features"],
  skin:        ["Dull Complexion",     "Skin Concerns",         "Suboptimal Skin Quality"],
};

function domLabel(key: TraitKey, score: number): string {
  const [a, b, c] = DOM_LABELS[key];
  return score >= 8.5 ? a : score >= 7 ? b : c;
}
function flawLabel(key: TraitKey, score: number): string {
  const [a, b, c] = FLAW_LABELS[key];
  return score <= 3.0 ? a : score <= 5.5 ? b : c;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function categorize(overall: number, traits: Record<TraitKey, number>): Omit<Scores, "overall" | "traits"> {
  const entries = Object.entries(traits) as [TraitKey, number][];
  const sorted   = [...entries].sort((a, b) => b[1] - a[1]);
  const domEntry  = sorted[0];
  const flawEntry = sorted[sorted.length - 1];
  const spread    = domEntry[1] - flawEntry[1];
  const balanced  = spread < 1.2 || domEntry[0] === flawEntry[0];

  const dom  = balanced
    ? { label: "Balanced Features", value: domEntry[1] }
    : { label: domLabel(domEntry[0], domEntry[1]), value: domEntry[1] };
  const flaw = balanced
    ? { label: "No Major Flaw", value: flawEntry[1] }
    : { label: flawLabel(flawEntry[0], flawEntry[1]), value: flawEntry[1] };

  const sub: Scores["sub"] =
    overall < 4.5 ? "SUB1" : overall < 5.5 ? "SUB2" : overall < 7.0 ? "SUB3" : overall < 8.5 ? "SUB4" : "SUB5";
  const tier: Scores["tier"] =
    overall < 5.5 ? { code: "LTN", starColor: "#9ca3af" }
    : overall < 7.0 ? { code: "MTN", starColor: "#fbbf24" }
    : { code: "HTN", starColor: "#22d3ee" };

  return {
    dom, flaw,
    elo:   Math.round(overall * 42 + 15),
    sub,   tier,
    level: `L${clamp(Math.round(overall) - 2, 1, 7)}`,
  };
}

function computeTraits(lm: LM[], luma?: number): Record<TraitKey, number> {
  return {
    canthalTilt: canthalTiltScore(lm),
    symmetry:    symmetryScore(lm),
    jawline:     jawlineScore(lm),
    harmony:     harmonyScore(lm),
    skin:        skinScore(luma),
  };
}

export function traitMean(traits: Record<TraitKey, number>): number {
  const vals = Object.values(traits);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// rawMean 6.0 → ~7.6, rawMean 7.0 → ~8.8
export function overallFromMean(rawMean: number, candy = 0): number {
  return clamp(rawMean * 1.2 + 0.4 + candy, 3, 10);
}

// Random candy boost applied only to the final locked result (0.2–0.5)
export function generateCandy(): number {
  return 0.2 + Math.random() * 0.3;
}

// Per-frame jitter for live variation
export function jitterTraits(traits: Record<TraitKey, number>, magnitude = 1.2): Record<TraitKey, number> {
  const j = (mag = magnitude) => (Math.random() - 0.5) * mag;
  return {
    canthalTilt: clamp(traits.canthalTilt + j(),      1, 10),
    symmetry:    clamp(traits.symmetry    + j(),      1, 10),
    jawline:     clamp(traits.jawline     + j(),      1, 10),
    harmony:     clamp(traits.harmony     + j(),      1, 10),
    skin:        clamp(traits.skin        + j(0.4),   1, 10),
  };
}

// α=0.3 → snappy response
export function smoothScores(prev: Scores | null, next: Scores, alpha = 0.3): Scores {
  if (!prev) return next;
  const e = (p: number, n: number) => p * (1 - alpha) + n * alpha;
  const traits: Record<TraitKey, number> = {
    canthalTilt: e(prev.traits.canthalTilt, next.traits.canthalTilt),
    symmetry:    e(prev.traits.symmetry,    next.traits.symmetry),
    jawline:     e(prev.traits.jawline,     next.traits.jawline),
    harmony:     e(prev.traits.harmony,     next.traits.harmony),
    skin:        e(prev.traits.skin,        next.traits.skin),
  };
  const overall = overallFromMean(traitMean(traits));
  return { overall, traits, ...categorize(overall, traits) };
}

export function buildScores(
  traits: Record<TraitKey, number>,
  domOverride?:  { label: string; value: number },
  flawOverride?: { label: string; value: number },
  candy = 0,
): Scores {
  const overall = overallFromMean(traitMean(traits), candy);
  const base    = categorize(overall, traits);
  return {
    overall, traits, ...base,
    ...(domOverride  ? { dom:  domOverride  } : {}),
    ...(flawOverride ? { flaw: flawOverride } : {}),
  };
}

export function scoreFace(landmarks: LM[], luma?: number): Scores | null {
  if (landmarks.length !== 478) return null;
  const corrected = rollCorrect(landmarks);
  const traits    = computeTraits(corrected, luma);
  const overall   = overallFromMean(traitMean(traits));
  return { overall, traits, ...categorize(overall, traits) };
}

const TRAIT_KEYS: TraitKey[] = ["canthalTilt","symmetry","jawline","harmony","skin"];

export function aggregateMedian(samples: number[][]): Scores | null {
  if (samples.length === 0) return null;
  const traits = {} as Record<TraitKey, number>;
  TRAIT_KEYS.forEach((key, i) => {
    const col = samples.map((s) => s[i]).sort((a, b) => a - b);
    const mid = Math.floor(col.length / 2);
    traits[key] = col.length % 2 === 0 ? (col[mid - 1] + col[mid]) / 2 : col[mid];
  });
  const overall = overallFromMean(traitMean(traits));
  return { overall, traits, ...categorize(overall, traits) };
}

export function traitsToVector(traits: Record<TraitKey, number>): number[] {
  return TRAIT_KEYS.map(k => traits[k]);
}
