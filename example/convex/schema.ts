import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  articles: defineTable({ title: v.string(), content: v.string() }),
  rateLimits: defineTable({
    key: v.string(),
    action: v.string(),
    timestamp: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_key_action", ["key", "action"])
    .index("by_expires_at", ["expiresAt"]),
});
