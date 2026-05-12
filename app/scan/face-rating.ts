// PSL face-rating engine — 6 sub-scores matching Omoggle methodology

export type TraitKey =
  | "canthalTilt"   // Eye area / hunter eyes
  | "symmetry"      // Bilateral facial symmetry
  | "jawline"       // Mandible definition / gonial angle
  | "harmony"       // Facial thirds, lips, FWHR, eye spacing combined
  | "skin"          // Skin quality, texture, and lighting
  | "goldenRatio";  // Closeness to divine proportion (φ = 1.618)

export type BonusEvent = {
  key:      string;
  label:    string;
  delta:    number;
  traitKey: TraitKey;
};

export type Badge = {
  id:       string;
  label:    string;
  color:    string;
  traitKey: TraitKey;
};

export type Scores = {
  overall: number;
  dom:  { label: string; value: number };
  flaw: { label: string; value: number };
  elo:  number;
  sub:  "SUB1" | "SUB2" | "SUB3" | "SUB4" | "SUB5";
  // 5-tier system matching Omoggle article: BCK < NRM < HTN < CHS < MOG
  tier: { code: "BCK" | "NRM" | "HTN" | "CHS" | "MOG"; starColor: string };
  level: string;
  traits: Record<TraitKey, number>;
  bonuses?: BonusEvent[];
  badges?:  Badge[];
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

// ─── Lighting confidence (0–1): how trustworthy are landmark-based measurements ─

export function lightingConfidence(luma: number): number {
  if (luma >= 90 && luma <= 200) return 1;
  if (luma < 90)  return Math.max(0, luma / 90);
  return Math.max(0, (245 - luma) / 45);
}

// ─── 1. Canthal Tilt — Eye Area ───────────────────────────────────────────────

function canthalTiltScore(lm: LM[]): number {
  const fw = dist(lm[234], lm[454]);
  if (fw === 0) return 4.5;
  const leftTilt  = (lm[133].y - lm[33].y)  / fw;
  const rightTilt = (lm[362].y - lm[263].y) / fw;
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

// ─── 3. Jawline — sharper angle = higher score; asymmetric to reward definition ─
// Ideal gonial angle ~110°. Being sharper is rewarded more leniently than being weak.

function jawlineScore(lm: LM[], luma?: number): number {
  const l = angleDeg(lm[234], lm[172], lm[152]);
  const r = angleDeg(lm[454], lm[397], lm[152]);
  const avg = (l + r) / 2;
  const dev = avg - 110; // negative = sharper than ideal, positive = weaker
  const raw = dev < 0
    ? clamp(9.5 - Math.abs(dev) / 4.5, 1, 10)  // sharp side: lenient drop
    : clamp(9.5 - dev / 2.2, 1, 10);             // weak side: steep drop
  if (luma === undefined) return raw;
  const conf = lightingConfidence(luma);
  // In bad lighting, blend toward a neutral floor so poor rooms don't kill jaw score
  return raw * conf + 6.0 * (1 - conf);
}

// ─── 4. Harmony ───────────────────────────────────────────────────────────────

function facialThirdsRaw(lm: LM[]): number {
  const t1 = Math.abs(lm[168].y - lm[10].y);
  const t2 = Math.abs(lm[94].y  - lm[168].y);
  const t3 = Math.abs(lm[152].y - lm[94].y);
  const total = t1 + t2 + t3;
  if (total < 0.01) return 5.5;
  const ideal = total / 3;
  const dev = (Math.abs(t1 - ideal) + Math.abs(t2 - ideal) + Math.abs(t3 - ideal)) / total;
  return clamp(9.5 - dev * 18, 1, 10);
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
    facialThirdsRaw(lm) * 0.35 +
    lipHarmonyRaw(lm)   * 0.25 +
    fwhrRaw(lm)         * 0.25 +
    interocularRaw(lm)  * 0.15,
    1, 10,
  );
}

// ─── 5. Skin — lighting quality proxy ────────────────────────────────────────

function skinScore(luma?: number): number {
  if (luma === undefined) return 6.2;
  if (luma < 40)  return 3.8;
  if (luma < 80)  return 5.2;
  if (luma < 120) return 6.0;
  if (luma < 160) return 7.0;
  if (luma < 200) return 7.5;
  if (luma < 228) return 6.8;
  return 5.5;
}

// ─── 6. Golden Ratio ──────────────────────────────────────────────────────────

const PHI = 1.6180339887;

function goldenRatioScore(lm: LM[]): number {
  const totalH = lm[152].y - lm[10].y;
  const lowerH = lm[152].y - lm[1].y;
  if (totalH < 0.005) return 5;
  const lowerPct = lowerH / totalH;
  const s1 = clamp(9.5 - Math.abs(lowerPct - 0.382) * 50, 1, 10);

  const mouthW = Math.abs(lm[291].x - lm[61].x);
  const noseW  = Math.abs(lm[326].x - lm[97].x);
  const s2 = noseW < 0.001 ? 5 : clamp(9.5 - Math.abs(mouthW / noseW - PHI) / PHI * 22, 1, 10);

  const upperH = lm[168].y - lm[10].y;
  const midH   = lm[1].y   - lm[168].y;
  const s3 = midH < 0.001 ? 5 : clamp(9.5 - Math.abs(upperH / midH - PHI) / PHI * 18, 1, 10);

  return clamp(s1 * 0.4 + s2 * 0.35 + s3 * 0.25, 1, 10);
}

// ─── Detector — eye aspect ratio (for live callouts + bonus) ─────────────────

// Eye aspect ratio — rewarded when eyes are open and engaged
export function detectEyeOpen(lm: LM[]): { detected: boolean; strength: number } {
  const leftEAR  = dist(lm[159], lm[145]) / (dist(lm[33],  lm[133]) + 0.001);
  const rightEAR = dist(lm[386], lm[374]) / (dist(lm[263], lm[362]) + 0.001);
  const avgEAR   = (leftEAR + rightEAR) / 2;
  const THRESHOLD = 0.28;
  if (avgEAR < THRESHOLD) return { detected: false, strength: 0 };
  return { detected: true, strength: clamp((avgEAR - THRESHOLD) / 0.12, 0, 1) };
}

// ─── Label tables ─────────────────────────────────────────────────────────────

const DOM_LABELS: Record<TraitKey, [string, string, string]> = {
  canthalTilt:  ["Hunter Eyes",            "Positive Canthal Tilt",  "Slight PCT"],
  symmetry:     ["Near-Perfect Symmetry",  "High Bilateral Symmetry","Good Balance"],
  jawline:      ["Defined Gonial Angle",   "Sharp Mandible",         "Solid Jawline"],
  harmony:      ["Perfect Facial Harmony", "High PSL Harmony",       "Good Proportions"],
  skin:         ["Flawless Complexion",    "Clear Glowing Skin",     "Above-Avg Skin"],
  goldenRatio:  ["Divine Proportions",     "Near-Phi Harmony",       "Golden Ratio Aligned"],
};

const FLAW_LABELS: Record<TraitKey, [string, string, string]> = {
  canthalTilt:  ["Prey Eyes",              "Negative Canthal Tilt",  "Mild NCT"],
  symmetry:     ["Facial Asymmetry",       "Bilateral Deviation",    "Minor Asymmetry"],
  jawline:      ["Recessed Mandible",      "Weak Gonial Angle",      "Soft Jawline"],
  harmony:      ["Poor Facial Harmony",    "Low PSL Harmony",        "Disharmonious Features"],
  skin:         ["Dull Complexion",        "Skin Concerns",          "Suboptimal Skin Quality"],
  goldenRatio:  ["Off-Phi Proportions",   "Asymmetric Ratios",      "Slight Ratio Deviation"],
};

function domLabel(key: TraitKey, score: number): string {
  const [a, b, c] = DOM_LABELS[key];
  return score >= 8.5 ? a : score >= 7 ? b : c;
}
function flawLabel(key: TraitKey, score: number): string {
  const [a, b, c] = FLAW_LABELS[key];
  return score <= 3.0 ? a : score <= 5.5 ? b : c;
}

// ─── Badge definitions ────────────────────────────────────────────────────────

const BADGE_DEFS: { traitKey: TraitKey; id: string; label: string; color: string }[] = [
  { traitKey: "canthalTilt", id: "HUNTER_EYES",    label: "Hunter Eyes",    color: "#22d3ee" },
  { traitKey: "jawline",     id: "SHARP_JAW",       label: "Sharp Jaw",      color: "#a3e635" },
  { traitKey: "skin",        id: "FLAWLESS_SKIN",   label: "Flawless Skin",  color: "#f9a8d4" },
  { traitKey: "goldenRatio", id: "GOLDEN_RATIO",    label: "Golden Ratio",   color: "#fbbf24" },
  { traitKey: "symmetry",    id: "MIRROR_SYMMETRY", label: "Mirror Symmetry",color: "#818cf8" },
  { traitKey: "harmony",     id: "PERFECT_HARMONY", label: "Perfect Harmony",color: "#34d399" },
];

export function computeBadges(traits: Record<TraitKey, number>): Badge[] {
  return BADGE_DEFS
    .filter(b => traits[b.traitKey] >= 8.0)
    .map(({ id, label, color, traitKey }) => ({ id, label, color, traitKey }));
}

// ─── Bonus computation ────────────────────────────────────────────────────────
// No smile bonus — face should be neutral/still. Structural bonuses only.

export function computeBonuses(
  traits: Record<TraitKey, number>,
  opts: {
    luma?:         number;
    eyeStrength?:  number;
    aiHighlights?: string[];
  } = {},
): BonusEvent[] {
  const bonuses: BonusEvent[] = [];

  const eye = opts.eyeStrength ?? 0;
  if (eye > 0) {
    bonuses.push({
      key: "eye_contact", label: "Eye Contact",
      delta: clamp(0.10 + eye * 0.10, 0.10, 0.20),
      traitKey: "canthalTilt",
    });
  }

  if (traits.goldenRatio >= 8.0) {
    bonuses.push({ key: "golden_ratio", label: "Phi Aligned", delta: 0.20, traitKey: "goldenRatio" });
  }

  const jawConf = opts.luma !== undefined ? lightingConfidence(opts.luma) : 1;
  if (traits.jawline >= 8.0 && jawConf >= 0.7) {
    bonuses.push({ key: "sharp_jaw", label: "Sharp Mandible", delta: 0.20, traitKey: "jawline" });
  }

  if (traits.symmetry >= 8.5) {
    bonuses.push({ key: "mirror_symmetry", label: "Mirror Symmetry", delta: 0.15, traitKey: "symmetry" });
  }

  if (traits.harmony >= 8.0) {
    bonuses.push({ key: "perfect_harmony", label: "Perfect Harmony", delta: 0.15, traitKey: "harmony" });
  }

  // AI-sourced highlights — small bonus each, capped at 3
  const highlights = opts.aiHighlights?.slice(0, 3) ?? [];
  for (const h of highlights) {
    bonuses.push({ key: `ai_${bonuses.length}`, label: h, delta: 0.05, traitKey: "harmony" });
  }

  return bonuses;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function categorize(overall: number, traits: Record<TraitKey, number>): Omit<Scores, "overall" | "traits" | "bonuses" | "badges"> {
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
    overall < 4.0 ? "SUB1" : overall < 6.0 ? "SUB2" : overall < 7.5 ? "SUB3" : overall < 9.0 ? "SUB4" : "SUB5";
  const tier: Scores["tier"] =
    overall >= 9.0 ? { code: "MOG", starColor: "#22d3ee" }
    : overall >= 7.5 ? { code: "CHS", starColor: "#f43f5e" }
    : overall >= 6.0 ? { code: "HTN", starColor: "#fbbf24" }
    : overall >= 4.0 ? { code: "NRM", starColor: "#d1d5db" }
    :                  { code: "BCK", starColor: "#6b7280" };

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
    jawline:     jawlineScore(lm, luma),
    harmony:     harmonyScore(lm),
    skin:        skinScore(luma),
    goldenRatio: goldenRatioScore(lm),
  };
}

// Jawline carries the most weight — definition and angle matter most
const TRAIT_WEIGHTS: Record<TraitKey, number> = {
  jawline:     0.22,
  harmony:     0.25,
  symmetry:    0.23,
  canthalTilt: 0.17,
  skin:        0.08,
  goldenRatio: 0.05,
};

export function traitMean(traits: Record<TraitKey, number>): number {
  let sum = 0, totalW = 0;
  for (const [key, val] of Object.entries(traits) as [TraitKey, number][]) {
    const w = TRAIT_WEIGHTS[key] ?? (1 / 6);
    sum += val * w;
    totalW += w;
  }
  return sum / totalW;
}

export function overallFromMean(rawMean: number, candy = 0): number {
  return clamp(rawMean * 1.2 + 0.2 + candy, 3, 10);
}

// Random candy boost (0.15–0.45)
export function generateCandy(): number {
  return 0.15 + Math.random() * 0.30;
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
    goldenRatio: clamp(traits.goldenRatio + j(0.6),   1, 10),
  };
}

export function smoothScores(prev: Scores | null, next: Scores, alpha = 0.3): Scores {
  if (!prev) return next;
  const e = (p: number, n: number) => p * (1 - alpha) + n * alpha;
  const traits: Record<TraitKey, number> = {
    canthalTilt: e(prev.traits.canthalTilt, next.traits.canthalTilt),
    symmetry:    e(prev.traits.symmetry,    next.traits.symmetry),
    jawline:     e(prev.traits.jawline,     next.traits.jawline),
    harmony:     e(prev.traits.harmony,     next.traits.harmony),
    skin:        e(prev.traits.skin,        next.traits.skin),
    goldenRatio: e(prev.traits.goldenRatio, next.traits.goldenRatio),
  };
  const overall = overallFromMean(traitMean(traits));
  return { overall, traits, ...categorize(overall, traits) };
}

export function buildScores(
  traits: Record<TraitKey, number>,
  domOverride?:  { label: string; value: number },
  flawOverride?: { label: string; value: number },
  candy = 0,
  bonuses?: BonusEvent[],
): Scores {
  const bonusDelta = (bonuses ?? []).reduce((s, b) => s + b.delta, 0);
  const overall    = overallFromMean(traitMean(traits), candy + bonusDelta);
  const base       = categorize(overall, traits);
  const badges     = computeBadges(traits);
  return {
    overall, traits, ...base,
    ...(domOverride  ? { dom:  domOverride  } : {}),
    ...(flawOverride ? { flaw: flawOverride } : {}),
    bonuses: bonuses ?? [],
    badges,
  };
}

export function scoreFace(landmarks: LM[], luma?: number): Scores | null {
  if (landmarks.length !== 478) return null;
  const corrected = rollCorrect(landmarks);
  const traits    = computeTraits(corrected, luma);
  const overall   = overallFromMean(traitMean(traits));
  return { overall, traits, ...categorize(overall, traits) };
}

const TRAIT_KEYS: TraitKey[] = ["canthalTilt","symmetry","jawline","harmony","skin","goldenRatio"];

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
