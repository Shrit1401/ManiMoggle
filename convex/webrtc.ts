import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const sendSignal = mutation({
  args: {
    roomId:  v.id("rooms"),
    from:    v.string(),
    to:      v.string(),
    type:    v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    // For offers/answers deduplicate (only keep latest)
    if (args.type !== "ice") {
      const old = await ctx.db
        .query("webrtcSignals")
        .withIndex("by_room_from_to", q =>
          q.eq("roomId", args.roomId).eq("from", args.from).eq("to", args.to)
        )
        .filter(q => q.eq(q.field("type"), args.type))
        .collect();
      for (const o of old) await ctx.db.delete(o._id);
    }
    await ctx.db.insert("webrtcSignals", { ...args, ts: Date.now() });
  },
});

export const getSignals = query({
  args: { roomId: v.id("rooms"), to: v.string() },
  handler: async (ctx, { roomId, to }) => {
    return ctx.db
      .query("webrtcSignals")
      .withIndex("by_room_to", q => q.eq("roomId", roomId).eq("to", to))
      .order("asc")
      .collect();
  },
});

export const deleteSignal = mutation({
  args: { id: v.id("webrtcSignals") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const clearRoomSignals = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const all = await ctx.db
      .query("webrtcSignals")
      .withIndex("by_room_to", q => q.eq("roomId", roomId))
      .collect();
    for (const s of all) await ctx.db.delete(s._id);
  },
});
