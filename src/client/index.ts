import type { GenericActionCtx, GenericDataModel, GenericMutationCtx, GenericQueryCtx, PaginationOptions } from "convex/server";
import type { Infer } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type { answer, source, syncState, locale } from "../component/validators.js";

export { answer as answerResultValidator, source as searchResultValidator, syncState as syncStateValidator } from "../component/validators.js";

export type SearchLocale = Infer<typeof locale>;
export type SearchResult = Infer<typeof source>;
export type AnswerResult = Infer<typeof answer>;
export type SyncState = Infer<typeof syncState>;
type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runAction">;
type MutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;

export class Askolia {
  constructor(private readonly component: ComponentApi) {}

  async search(ctx: ActionCtx, args: { query: string; locale?: SearchLocale; limit?: number }): Promise<SearchResult[]> {
    return await ctx.runAction(this.component.search.search, args);
  }

  async ask(ctx: ActionCtx, args: { query: string; locale?: SearchLocale; clientId: string }): Promise<AnswerResult> {
    return await ctx.runAction(this.component.search.ask, args);
  }

  /** Commits only an intent. Delivery to Askolia happens after the host transaction commits. */
  async syncDocument(ctx: MutationCtx, args: { key: string; title: string; content: string }): Promise<number> {
    return await ctx.runMutation(this.component.sync.syncDocument, args);
  }

  async removeDocument(ctx: MutationCtx, args: { key: string }): Promise<number> {
    return await ctx.runMutation(this.component.sync.removeDocument, args);
  }

  async getSyncState(ctx: QueryCtx, args: { key: string }): Promise<SyncState | null> {
    return await ctx.runQuery(this.component.sync.getSyncState, args);
  }

  async retrySync(ctx: MutationCtx, args: { key: string }): Promise<null> {
    return await ctx.runMutation(this.component.sync.retrySync, args);
  }

  async listFailed(ctx: QueryCtx, args: { paginationOpts: PaginationOptions }): Promise<{ page: SyncState[]; isDone: boolean; continueCursor: string }> {
    return await ctx.runQuery(this.component.sync.listFailed, args);
  }
}
