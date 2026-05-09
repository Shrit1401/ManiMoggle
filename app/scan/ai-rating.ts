import type { TraitKey } from "./face-rating";

const HACKCLUB_KEY = process.env.NEXT_PUBLIC_HACKCLUB_KEY ?? "";

export type AIRating = {
  traits: Record<TraitKey, number>;
  dom: { trait: string; label: string; value: number };
  flaw: { trait: string; label: string; value: number };
};

const PROMPT = `You are the facial rating engine for Manimoggle, a face-scanning game. Analyze the face (and hair) and score 8 traits from 1–10 using a REAL scale.

CRITICAL CALIBRATION:
- Plain/average faces: 4.5–6.5
- Decent looking: 6.5–7.5
- Attractive: 7.5–8.5
- Very attractive / model-tier: 8.5–9.5
- Exceptional: 9.5–10
- You MUST differentiate people significantly. If two people have different faces, their scores MUST differ by at least 1–2 points. Do NOT cluster everyone at 7–8.

Rate these 8 traits (1–10 each):
- canthalTilt: outer canthus visibly higher = hunter eyes = high. Flat or downward slant = low (4 or below for negative tilt).
- jawline: sharp defined angle, strong mandible = high. Weak/recessed = 4 or below.
- midfaceRatio: balanced thirds, forward projected maxilla = high. Long or recessed midface = low.
- symmetry: perfect bilateral symmetry = 9–10. Any visible asymmetry = deduct significantly.
- lipFullness: full, plump, well-shaped = high. Thin or undefined = 4 or below.
- fwhr: ideal ~1.9–2.1 width-to-height = high. Too narrow or too wide = low.
- interocularRatio: ideal eye spacing = high. Close-set or wide-set = 4–5.
- hairQuality: LOOK AT THE HAIR — volume, thickness, density, lustre, and style. Thick, full, healthy, styled = 8–10. Average hair = 5–7. Thin/flat/sparse/dull = 3–5. This is a REAL feature that matters.

Rules:
- DOM = highest trait. FLAW = lowest trait. They MUST be different traits.
- Spread between DOM and FLAW should be ≥1.5 points.
- If genuinely all traits within 1.2 points, dom.label="Balanced Features" and flaw.label="No Major Flaw".
- Hair CAN be DOM or FLAW — base it on what you actually see.

DOM labels: "Hunter Eyes","Forward Maxilla","Defined Gonial Angle","Near-Perfect Symmetry","Full Lips","Dominant FWHR","Ideal Eye Spacing","Full Hair Volume","Thick Healthy Hair"
FLAW labels: "Negative Canthal Tilt","Prey Eyes","Recessed Mandible","Maxillary Retrusion","Facial Asymmetry","Thin Lips","Narrow Facial Frame","Close-Set Eyes","Thin Hair","Low Hair Volume"

Respond with ONLY valid JSON — no markdown, no extra text:
{"traits":{"canthalTilt":N,"jawline":N,"midfaceRatio":N,"symmetry":N,"lipFullness":N,"fwhr":N,"interocularRatio":N,"hairQuality":N},"dom":{"trait":"key","label":"label","value":N},"flaw":{"trait":"key","label":"label","value":N}}`;

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
