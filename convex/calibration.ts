import { mutation, query } from "./_generated/server";

const TRAIT_KEYS = ["canthalTilt", "symmetry", "jawline", "harmony", "skin", "goldenRatio"] as const;
const MIN_SAMPLES = 10;

export const getCalibration = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("calibration").order("desc").first();
  },
});

// Reads accumulated faceScanData, computes per-trait mean error (aiTrait − rawTrait),
// and saves a calibration row. Called by the cron and can be triggered manually.
export const computeAndSave = mutation({
  args: {},
  handler: async (ctx) => {
    const allScans = await ctx.db.query("faceScanData").collect();
    const paired   = allScans.filter(s => s.rawTraitsJson && s.aiTraitsJson);

    if (paired.length < MIN_SAMPLES) return null;

    const offsets: Record<string, number> = {};

    for (const key of TRAIT_KEYS) {
      const errors: number[] = [];
      for (const scan of paired) {
        try {
          const raw = JSON.parse(scan.rawTraitsJson!) as Record<string, number>;
          const ai  = JSON.parse(scan.aiTraitsJson!)  as Record<string, number>;
          if (typeof raw[key] === "number" && typeof ai[key] === "number") {
            errors.push(ai[key] - raw[key]);
          }
        } catch { /* skip malformed rows */ }
      }
      offsets[key] = errors.length > 0
        ? errors.reduce((s, e) => s + e, 0) / errors.length
        : 0;
    }

    await ctx.db.insert("calibration", {
      computedAt:   Date.now(),
      sampleCount:  paired.length,
      traitOffsets: JSON.stringify(offsets),
    });

    return offsets;
  },
});
