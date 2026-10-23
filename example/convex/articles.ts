import { v } from "convex/values";
import { Askolia, answerResultValidator, searchResultValidator, syncStateValidator } from "@appik-studio/askolia-convex";
import { components } from "./_generated/api.js";
import { internalAction, internalMutation, internalQuery } from "./_generated/server.js";

const askolia = new Askolia(components.askolia);

// These examples are internal. Authenticate and authorize callers before exposing wrappers to users.
export const publish = internalMutation({
  args: { title: v.string(), content: v.string() },
  returns: v.id("articles"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("articles", args);
    await askolia.syncDocument(ctx, { key: id, ...args });
    return id;
  },
});

export const remove = internalMutation({
  args: { id: v.id("articles") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    await askolia.removeDocument(ctx, { key: id });
    return null;
  },
});

export const state = internalQuery({
  args: { key: v.string() },
  returns: v.union(syncStateValidator, v.null()),
  handler: async (ctx, args) => await askolia.getSyncState(ctx, args),
});

export const search = internalAction({
  args: { query: v.string() },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => await askolia.search(ctx, args),
});

export const ask = internalAction({
  args: { query: v.string(), clientId: v.string() },
  returns: answerResultValidator,
  handler: async (ctx, args) => await askolia.ask(ctx, args),
});
