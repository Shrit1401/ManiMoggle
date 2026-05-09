import type { TraitKey } from "./face-rating";

const HACKCLUB_KEY = process.env.NEXT_PUBLIC_HACKCLUB_KEY ?? "";

export type AIRating = {
  traits: Record<TraitKey, number>;
  dom: { trait: string; label: string; value: number };
  flaw: { trait: string; label: string; value: number };
};

const PROMPT = `You are the PSL facial rating engine for Manimoggle. Analyze the face using the PSL (Pretty Scale Looks) methodology and score exactly 5 sub-scores from 1–10.

CRITICAL CALIBRATION — use the FULL range:
- Below average / plain: 3.0–5.0
- Average: 5.0–6.5
- Above average / decent: 6.5–7.5
- Attractive: 7.5–8.5
- High PSL / model-tier: 8.5–9.5
- Exceptional: 9.5–10
You MUST differentiate significantly between people. Do NOT cluster everyone at 7–8.

Score these 5 PSL sub-scores (1–10 each):

canthalTilt — Eye area / hunter eyes. Measure the angle from inner to outer eye corner.
  Positive tilt (outer canthus visibly higher than inner) = hunter eyes = HIGH (7–10).
  Neutral/flat = 5–6. Negative tilt (outer lower than inner) = prey eyes = LOW (1–4).

symmetry — Bilateral facial symmetry. Perfect mirror = 9–10. Visible asymmetry in eyes, nose, mouth = deduct 1–2 pts per flaw. Most faces are 5–7.5.

jawline — Mandible definition and gonial angle. Sharp, defined jaw with visible angle = 8–10. Square/wide jaw = 7–8. Average = 5–6. Weak/recessed/undefined = 2–5.

harmony — Overall facial proportions: facial thirds balance, lip ratio, face width-to-height, eye spacing combined. Perfect golden-ratio proportions = 9–10. Average proportions = 5–6. Off-balance features = 3–5.

skin — Skin quality, texture, evenness, and clarity visible in the photo. Flawless, glowing = 8–10. Average = 5–6. Blemishes, uneven tone, dull texture = 3–5. Lighting quality affects this score.

Rules:
- DOM = highest-scoring trait. FLAW = lowest-scoring trait. They MUST be different traits.
- Spread between DOM and FLAW MUST be ≥1.5 points. Force separation if needed.
- If all traits genuinely within 1.2 points: dom.label="Balanced Features", flaw.label="No Major Flaw".

DOM labels (use exact strings): "Hunter Eyes","Positive Canthal Tilt","Slight PCT","Near-Perfect Symmetry","High Bilateral Symmetry","Good Balance","Defined Gonial Angle","Sharp Mandible","Solid Jawline","Perfect Facial Harmony","High PSL Harmony","Good Proportions","Flawless Complexion","Clear Glowing Skin","Above-Avg Skin","Balanced Features"
FLAW labels (use exact strings): "Prey Eyes","Negative Canthal Tilt","Mild NCT","Facial Asymmetry","Bilateral Deviation","Minor Asymmetry","Recessed Mandible","Weak Gonial Angle","Soft Jawline","Poor Facial Harmony","Low PSL Harmony","Disharmonious Features","Dull Complexion","Skin Concerns","Suboptimal Skin Quality","No Major Flaw"

Respond with ONLY valid JSON — no markdown, no extra text:
{"traits":{"canthalTilt":N,"symmetry":N,"jawline":N,"harmony":N,"skin":N},"dom":{"trait":"canthalTilt|symmetry|jawline|harmony|skin","label":"label","value":N},"flaw":{"trait":"canthalTilt|symmetry|jawline|harmony|skin","label":"label","value":N}}`;

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
        max_tokens: 380,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.replace(/```[a-z]*\n?|\n?```/g, "").trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]) as AIRating;
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
