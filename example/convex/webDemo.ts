import { v } from "convex/values";
import {
  Askolia,
  answerResultValidator,
  searchResultValidator,
  type AnswerResult,
  type SearchResult,
} from "@appik-studio/askolia-convex";
import { components, internal } from "./_generated/api.js";
import { action, internalMutation, query } from "./_generated/server.js";

const askolia = new Askolia(components.askolia);
const budgetKey = "askolia-web-demo";
const budgetAction = "request";
const minute = 60_000;
const day = 86_400_000;
const documents = [
  {
    key: "demo:convex:overview",
    title: "Askolia Convex component",
    content: "@appik-studio/askolia-convex version 0.1.0 is an MIT-licensed Convex component for website search, sourced AI answers and document synchronization. It requires Convex 1.46 or newer. The component is open source; the hosted Askolia application is a separate service. Install with bun add @appik-studio/askolia-convex convex. Public source: https://github.com/Appik-Studio/askolia-convex . Package: https://www.npmjs.com/package/@appik-studio/askolia-convex .",
  },
  {
    key: "demo:convex:synchronization",
    title: "Document delivery and server keys",
    content: "Call syncDocument inside the host mutation to record an intent transactionally. Delivery to Askolia happens after commit and is eventually consistent. Stable business keys and increasing revisions support updates and removals. Network failures, HTTP 408 and 5xx responses retry up to eight attempts. HTTP 429 responses wait 60 to 75 seconds without consuming that retry budget. Other HTTP errors stop delivery; operators can call retrySync after correcting the cause. Keep ASKOLIA_API_KEY and ASKOLIA_URL on the Convex server. Only synchronize public content; version 0.1.0 does not synchronize permissions or private user data. Guide: https://github.com/Appik-Studio/askolia-convex#synchronize-public-documents .",
  },
  {
    key: "demo:convex:limits",
    title: "Version 0.1.0 limits",
    content: "Queries contain 2 to 200 characters. Search accepts an integer limit from 1 to 20. Supported locales are en, fr, de, es and it. The ask method answers one question per call and returns answer, abstain or unavailable; it does not maintain a conversation thread. Documents require a key of at most 200 characters, a title of 1 to 200 characters and 1 to 100000 UTF-8 bytes of text or Markdown. Version 0.1.0 does not attach a source URL or extract PDFs. Each component instance retains at most 2000 distinct keys, including deletion tombstones; deletion does not reclaim a key slot. AI answers remain subject to the Askolia project's plan, generation allowance and rate limits. Limits: https://github.com/Appik-Studio/askolia-convex#observe-delivery .",
  },
];

function requireEnabled() {
  if (process.env.ASKOLIA_DEMO_ENABLED !== "1") {
    throw new Error("The interactive demo is disabled.");
  }
}

function validateQuery(value: string) {
  const query = value.trim();
  if (query.length < 2 || query.length > 200) {
    throw new Error("Query must contain 2 to 200 characters.");
  }
  return query;
}

export const reserve = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    requireEnabled();
    const now = Date.now();
    const rows = await ctx.db.query("rateLimits")
      .withIndex("by_key_action", (q) => q.eq("key", budgetKey).eq("action", budgetAction))
      .take(101);
    let daily = 0;
    let recent = 0;
    for (const row of rows) {
      if (row.timestamp <= now - day) {
        await ctx.db.delete(row._id);
      } else {
        daily++;
        if (row.timestamp > now - minute) recent++;
      }
    }
    // Fail closed on an oversized bucket; bounded cleanup still commits.
    if (rows.length === 101 || daily >= 100 || recent >= 12) return false;
    await ctx.db.insert("rateLimits", {
      key: budgetKey,
      action: budgetAction,
      timestamp: now,
      expiresAt: now + day,
    });
    return true;
  },
});

export const search = action({
  args: { query: v.string() },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args): Promise<SearchResult[]> => {
    requireEnabled();
    const query = validateQuery(args.query);
    if (!await ctx.runMutation(internal.webDemo.reserve, {})) {
      throw new Error("The demo request limit has been reached. Please try again later.");
    }
    return await askolia.search(ctx, { query, locale: "en", limit: 5 });
  },
});

export const ask = action({
  args: { query: v.string() },
  returns: answerResultValidator,
  handler: async (ctx, args): Promise<AnswerResult> => {
    requireEnabled();
    const query = validateQuery(args.query);
    if (!await ctx.runMutation(internal.webDemo.reserve, {})) {
      throw new Error("The demo request limit has been reached. Please try again later.");
    }
    return await askolia.ask(ctx, { query, locale: "en", clientId: "askolia-web-demo" });
  },
});

export const seed = internalMutation({
  args: {},
  returns: v.array(v.object({ key: v.string(), revision: v.number() })),
  handler: async (ctx) => {
    requireEnabled();
    const receipts = [];
    for (const document of documents) {
      receipts.push({ key: document.key, revision: await askolia.syncDocument(ctx, document) });
    }
    return receipts;
  },
});

export const status = query({
  args: {},
  returns: v.array(v.object({
    key: v.string(),
    title: v.string(),
    status: v.union(v.literal("not_synced"), v.literal("pending"), v.literal("syncing"), v.literal("synced"), v.literal("failed")),
    revision: v.number(),
    lastSyncedAt: v.optional(v.number()),
  })),
  handler: async (ctx) => {
    requireEnabled();
    const states = [];
    for (const { key, title } of documents) {
      const state = await askolia.getSyncState(ctx, { key });
      states.push({
        key,
        title,
        status: state?.status ?? "not_synced" as const,
        revision: state?.revision ?? 0,
        ...(state?.lastSyncedAt !== undefined ? { lastSyncedAt: state.lastSyncedAt } : {}),
      });
    }
    return states;
  },
});
