import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostSessionId: v.string(),
    createdAt: v.number(),
    mode: v.optional(v.string()), // "battle" | "tournament" | "group"
    // 1v1 battle fields
    fighterA: v.optional(v.string()),
    fighterB: v.optional(v.string()),
    battleSettled: v.optional(v.boolean()),
    // tournament fields
    tournamentBracket: v.optional(v.string()), // JSON
    tournamentStatus: v.optional(v.string()),  // "lobby" | "running" | "complete"
    // group scan fields
    groupStarted: v.optional(v.boolean()),
    groupComplete: v.optional(v.boolean()),
    groupScanStartAt: v.optional(v.number()), // epoch ms when scan fires
  }).index("by_code", ["code"]),

  webrtcSignals: defineTable({
    roomId: v.id("rooms"),
    from:   v.string(),
    to:     v.string(),
    type:   v.string(), // "offer" | "answer" | "ice"
    payload: v.string(),
    ts:     v.number(),
  })
    .index("by_room_to", ["roomId", "to"])
    .index("by_room_from_to", ["roomId", "from", "to"]),

  faceScanData: defineTable({
    roomId:           v.id("rooms"),
    sessionId:        v.string(),
    capturedAt:       v.number(),
    // Landmark-geometry trait scores (pre-AI, median-aggregated)
    rawTraitsJson:    v.optional(v.string()),  // JSON: Record<TraitKey, number>
    rawOverall:       v.optional(v.number()),
    // Gemini AI trait scores
    aiTraitsJson:     v.optional(v.string()),  // JSON: Record<TraitKey, number>
    aiOverall:        v.optional(v.number()),
    aiDomLabel:       v.optional(v.string()),
    aiFlawLabel:      v.optional(v.string()),
    // Final composite scores shown to user
    finalOverall:     v.number(),
    finalElo:         v.number(),
    finalSub:         v.string(),
    finalTierCode:    v.string(),
    finalLevel:       v.string(),
    finalDomLabel:    v.string(),
    finalFlawLabel:   v.string(),
    // Scan quality metrics
    samplesCollected: v.optional(v.number()),
    samplesSkipped:   v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_room", ["roomId"]),

  players: defineTable({
    roomId: v.id("rooms"),
    sessionId: v.string(),
    name: v.string(),
    phase: v.union(v.literal("lobby"), v.literal("scanning"), v.literal("done")),
    overall: v.optional(v.number()),
    elo: v.optional(v.number()),
    sub: v.optional(v.string()),
    tierCode: v.optional(v.string()),
    tierColor: v.optional(v.string()),
    level: v.optional(v.string()),
    domLabel: v.optional(v.string()),
    flawLabel: v.optional(v.string()),
    wins: v.optional(v.number()),
    losses: v.optional(v.number()),
    joinedAt: v.number(),
    snapshot: v.optional(v.string()), // base64 JPEG for group grid
    liveScore: v.optional(v.number()), // live score during scanning (ephemeral)
  })
    .index("by_room", ["roomId"])
    .index("by_room_session", ["roomId", "sessionId"]),
});
