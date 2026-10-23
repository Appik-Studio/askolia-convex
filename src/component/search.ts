import { v } from "convex/values";
import { action } from "./_generated/server.js";
import { request } from "./transport.js";
import { answer, locale, source } from "./validators.js";

function validateQuery(query: string) {
  if (query.length > 200 || query.trim().length < 2) throw new Error("Query must contain 2 to 200 characters.");
}

export const search = action({
  args: { query: v.string(), locale: v.optional(locale), limit: v.optional(v.number()) },
  returns: v.array(source),
  handler: async (_ctx, args) => {
    validateQuery(args.query);
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20)) throw new Error("Search limit must be an integer from 1 to 20.");
    return await request("/api/v1/search", args) as Array<{ _id: string; question: string; answer: string; group?: string; url?: string }>;
  },
});

export const ask = action({
  args: { query: v.string(), locale: v.optional(locale), clientId: v.string() },
  returns: answer,
  handler: async (_ctx, args) => {
    validateQuery(args.query);
    if (args.clientId.length < 8 || args.clientId.length > 200 || !/^[a-zA-Z0-9._:-]+$/.test(args.clientId)) throw new Error("Client ID must contain 8 to 200 letters, digits, dots, underscores, colons or hyphens.");
    return await request("/api/v1/ask", args) as
    | { kind: "answer"; answer: string; sources: Array<{ _id: string; question: string; answer: string; group?: string; url?: string }> }
    | { kind: "abstain" | "unavailable"; sources: Array<{ _id: string; question: string; answer: string; group?: string; url?: string }> };
  },
});
