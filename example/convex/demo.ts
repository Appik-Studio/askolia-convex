import { v } from "convex/values";
import {
  Askolia,
  answerResultValidator,
  searchResultValidator,
  syncStateValidator,
} from "@appik-studio/askolia-convex";
import { components } from "./_generated/api.js";
import { internalAction, internalMutation, internalQuery } from "./_generated/server.js";

const askolia = new Askolia(components.askolia);
// Reuse this business key across runs. V1 retains tombstones and their key slots.
const key = "demo:shipping";
const receipt = v.object({ key: v.string(), revision: v.number() });

export const sync = internalMutation({
  args: {},
  returns: receipt,
  handler: async (ctx) => {
    const revision = await askolia.syncDocument(ctx, {
      key,
      title: "Demo shipping policy",
      content: "Demo orders ship within two business days. Demo shipping is free.",
    });
    return { key, revision };
  },
});

export const status = internalQuery({
  args: {},
  returns: v.union(syncStateValidator, v.null()),
  handler: async (ctx) => await askolia.getSyncState(ctx, { key }),
});

export const search = internalAction({
  args: { query: v.string() },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => await askolia.search(ctx, { ...args, locale: "en", limit: 5 }),
});

export const ask = internalAction({
  args: { query: v.string() },
  returns: answerResultValidator,
  handler: async (ctx, args) => await askolia.ask(ctx, {
    ...args,
    locale: "en",
    clientId: "askolia-cli-demo",
  }),
});

export const retry = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => await askolia.retrySync(ctx, { key }),
});

export const remove = internalMutation({
  args: {},
  returns: receipt,
  handler: async (ctx) => ({
    key,
    revision: await askolia.removeDocument(ctx, { key }),
  }),
});

export const verifyCleanup = internalQuery({
  args: { revision: v.number() },
  returns: syncStateValidator,
  handler: async (ctx, { revision }) => {
    const state = await askolia.getSyncState(ctx, { key });
    if (!state || state.revision !== revision || state.operation !== "remove" ||
      state.status !== "synced" || state.documentId !== undefined) {
      throw new Error("Removal is not acknowledged for this revision. Inspect demo:status and retry a failed delivery.");
    }
    return state;
  },
});
