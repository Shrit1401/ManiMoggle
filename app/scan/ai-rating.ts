import type { TraitKey } from "./face-rating";

const HACKCLUB_KEY = process.env.NEXT_PUBLIC_HACKCLUB_KEY ?? "";

export type AIRating = {
  traits:     Record<TraitKey, number>;
  dom:        { trait: string; label: string; value: number };
  flaw:       { trait: string; label: string; value: number };
  highlights: string[];           // 1–3 positive callouts Gemini spotted
  lightingPenalty?: boolean;      // true when photo is dark/overexposed
};

const PROMPT = `You are the PSL facial rating engine for Manimoggle — a fun, gamified face-battle app. Rate the face honestly and calibrated: a 7 is genuinely good, 8+ is exceptional, 9+ is model-tier rare. Don't inflate — differentiate clearly between faces.

CALIBRATION — typical distribution:
- Most people land 5.0–7.0 across traits.
- Clearly good/defined features: 7.0–8.0.
- Exceptional, standout features: 8.0–9.0.
- Model-tier, rare: 9.0–10.
- Only score below 4.5 for a trait that is genuinely below average in a specific measurable way.
- Do NOT cluster all traits together. Variance between traits MUST be ≥ 1.5 points (people always have strengths and weaknesses).
- Do NOT punish skin or jawline for poor lighting / dark photo — if the image is dark or overexposed, set lightingPenalty:true and hold skin and jawline at 6.0 rather than scoring them low.

Score these 6 PSL sub-scores (1–10 each):

canthalTilt — Eye area / hunter eyes. Positive tilt (outer canthus higher than inner) = hunter eyes = HIGH (7.0–9.5). Neutral = 4.5–6.0. Negative tilt = prey eyes = LOW (2–4.5). Only score 7+ when tilt is clearly visible.

symmetry — Bilateral facial symmetry. Reward genuine symmetry but be honest (6.0–7.5 for most faces). Only score 8+ for near-perfect bilateral symmetry. Score below 5.0 for clearly visible significant asymmetry.

jawline — Mandible definition. Clear angle/sharp definition = 7.0–8.5. Average = 5.0–6.5. Soft/undefined = 3–5.0. Skip deductions purely for lighting shadows.

harmony — Overall facial proportions (thirds balance, lip ratio, face width-to-height, eye spacing). Well-balanced = 5.5–7.5. Average = 4.5–5.5. Noticeably off-balance = 3.0–4.5.

skin — Skin quality, clarity, texture visible in the photo. Clear, even = 6.5–8.5. Average = 5.0–6.5. Only score below 4.5 for obvious blemishes or very uneven tone visible in good lighting.

goldenRatio — How closely facial measurements approach phi (1.618). Score 7+ only when most ratios genuinely approach phi. Average alignment = 5.0–6.5.

After scoring traits, identify:
- DOM = highest-scoring trait.
- FLAW = lowest-scoring trait. Must be a different trait from DOM.
- If spread < 1.5: force DOM up or FLAW down by 0.5 to create separation.

highlights: 1–3 short, specific, positive callouts about what you genuinely liked — things that stand out positively. Examples: "Defined gonial angle", "Bright, open eyes", "Genuine warm smile", "Strong facial symmetry", "Sharp brow ridge", "Prominent cheekbones", "Well-proportioned nose bridge". Be specific, not generic.

DOM labels (use exact strings): "Hunter Eyes","Positive Canthal Tilt","Slight PCT","Near-Perfect Symmetry","High Bilateral Symmetry","Good Balance","Defined Gonial Angle","Sharp Mandible","Solid Jawline","Perfect Facial Harmony","High PSL Harmony","Good Proportions","Flawless Complexion","Clear Glowing Skin","Above-Avg Skin","Divine Proportions","Near-Phi Harmony","Golden Ratio Aligned","Balanced Features"
FLAW labels (use exact strings): "Prey Eyes","Negative Canthal Tilt","Mild NCT","Facial Asymmetry","Bilateral Deviation","Minor Asymmetry","Recessed Mandible","Weak Gonial Angle","Soft Jawline","Poor Facial Harmony","Low PSL Harmony","Disharmonious Features","Dull Complexion","Skin Concerns","Suboptimal Skin Quality","Off-Phi Proportions","Asymmetric Ratios","Slight Ratio Deviation","No Major Flaw"

Respond with ONLY valid JSON — no markdown, no extra text:
{"traits":{"canthalTilt":N,"symmetry":N,"jawline":N,"harmony":N,"skin":N,"goldenRatio":N},"dom":{"trait":"canthalTilt|symmetry|jawline|harmony|skin|goldenRatio","label":"label","value":N},"flaw":{"trait":"canthalTilt|symmetry|jawline|harmony|skin|goldenRatio","label":"label","value":N},"highlights":["...","..."],"lightingPenalty":false}`;

export async function rateFromImage(jpegBase64: string): Promise<AIRating | null> {
  try {
    const res = await fetch("https://ai.hackclub.com/proxy/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HACKCLUB_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
            ],
          },
        ],
        max_tokens: 520,
        temperature: 0.55,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.replace(/```[a-z]*\n?|\n?```/g, "").trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as AIRating;
    // Ensure highlights is always an array
    if (!Array.isArray(parsed.highlights)) parsed.highlights = [];
    return parsed;
  } catch {
    return null;
  }
}

export function captureVideoFrame(video: HTMLVideoElement): string | null {
  try {
    const c = document.createElement("canvas");
    c.width  = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const url = c.toDataURL("image/jpeg", 0.82);
    return url.split(",")[1] ?? null;
  } catch {
    return null;
  }
}
