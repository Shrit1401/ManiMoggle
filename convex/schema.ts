import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostSessionId: v.string(),
    createdAt: v.number(),
    // current 1v1 fighters (sessionIds); others are in queue
    fighterA: v.optional(v.string()),
    fighterB: v.optional(v.string()),
    battleSettled: v.optional(v.boolean()),
  }).index("by_code", ["code"]),

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
  })
    .index("by_room", ["roomId"])
    .index("by_room_session", ["roomId", "sessionId"]),
});
