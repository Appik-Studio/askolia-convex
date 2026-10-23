/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    search: {
      ask: FunctionReference<
        "action",
        "internal",
        {
          clientId: string;
          locale?: "en" | "fr" | "de" | "es" | "it";
          query: string;
        },
        | {
            answer: string;
            kind: "answer";
            sources: Array<{
              _id: string;
              answer: string;
              group?: string;
              question: string;
              url?: string;
            }>;
          }
        | {
            kind: "abstain";
            sources: Array<{
              _id: string;
              answer: string;
              group?: string;
              question: string;
              url?: string;
            }>;
          }
        | {
            kind: "unavailable";
            sources: Array<{
              _id: string;
              answer: string;
              group?: string;
              question: string;
              url?: string;
            }>;
          },
        Name
      >;
      search: FunctionReference<
        "action",
        "internal",
        {
          limit?: number;
          locale?: "en" | "fr" | "de" | "es" | "it";
          query: string;
        },
        Array<{
          _id: string;
          answer: string;
          group?: string;
          question: string;
          url?: string;
        }>,
        Name
      >;
    };
    sync: {
      getSyncState: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          attempts: number;
          documentId?: string;
          key: string;
          lastError?: string;
          lastSyncedAt?: number;
          nextAttemptAt?: number;
          operation: "upsert" | "remove";
          revision: number;
          status: "pending" | "syncing" | "synced" | "failed";
        } | null,
        Name
      >;
      listFailed: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            attempts: number;
            documentId?: string;
            key: string;
            lastError?: string;
            lastSyncedAt?: number;
            nextAttemptAt?: number;
            operation: "upsert" | "remove";
            revision: number;
            status: "pending" | "syncing" | "synced" | "failed";
          }>;
        },
        Name
      >;
      removeDocument: FunctionReference<
        "mutation",
        "internal",
        { key: string },
        number,
        Name
      >;
      retrySync: FunctionReference<
        "mutation",
        "internal",
        { key: string },
        null,
        Name
      >;
      syncDocument: FunctionReference<
        "mutation",
        "internal",
        { content: string; key: string; title: string },
        number,
        Name
      >;
    };
  };
