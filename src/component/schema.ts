import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { operation, status } from "./validators.js";

export default defineSchema({
  settings: defineTable({ name: v.string(), value: v.string() }).index("by_name", ["name"]),
  documents: defineTable({
    key: v.string(),
    revision: v.number(),
    operation,
    status,
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    attempts: v.number(),
    attemptSerial: v.number(),
    leaseUntil: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    documentId: v.optional(v.string()),
  }).index("by_key", ["key"]).index("by_status", ["status"]),
});
