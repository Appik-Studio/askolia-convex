# @appik-studio/askolia-convex

Connect a Convex app to Askolia for website search, sourced AI answers and document synchronization. Your app records synchronization intents inside its mutations. The component sends them to Askolia after the transaction commits.

The matching Askolia backend API must be deployed before a remote installation can synchronize.

```sh
bun add @appik-studio/askolia-convex convex
```

## Demo and guides

- [Run the Convex lifecycle demo](example/README.md).
- Read the launch guide in [English](https://askolia.app/blog/askolia-convex-component), [French](https://askolia.app/fr/blog/composant-convex-askolia), or [German](https://askolia.app/de/blog/askolia-convex-komponente).
- [npm package](https://www.npmjs.com/package/@appik-studio/askolia-convex).

This MIT repository contains the reusable component and its example. The hosted Askolia application is a separate service.

## Configure the component

The component requires Convex 1.46 or newer. Install it from npm in your application with the command above, then register it with these exports:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import askolia from "@appik-studio/askolia-convex/convex.config.js";

const app = defineApp({
  env: {
    ASKOLIA_URL: v.optional(v.string()),
    ASKOLIA_API_KEY: v.optional(v.string()),
  },
});
app.use(askolia, {
  env: {
    ASKOLIA_URL: app.env.ASKOLIA_URL,
    ASKOLIA_API_KEY: app.env.ASKOLIA_API_KEY,
  },
});
export default app;
```

Set `ASKOLIA_URL` to your Askolia backend's HTTPS HTTP actions origin, such as `https://YOUR-DEPLOYMENT.convex.site`. This is not the dashboard URL or the `.convex.cloud` URL. Set `ASKOLIA_API_KEY` to a server integration token for one Askolia project. Use Convex deployment environment variables, not frontend environment variables. Missing credentials permit installation but make requests fail.

Use a separate Askolia project and integration key for each consuming Convex deployment. Never reuse production credentials in development or preview deployments, and never place a production key in preview default environment variables. Each component instance has its own namespace, but every namespace using one project's keys contributes to that project's public search and permanent mapping limit. Deleting a Convex preview or revoking its key does not remove its synchronized documents or reclaim mapping slots. Configure previews individually against disposable Askolia projects, or leave their credentials unset.

For hosted Askolia, use `https://tacit-goose-489.eu-west-1.convex.site` as `ASKOLIA_URL` and [contact Appik Studio](mailto:contact@appik-studio.ch?subject=Askolia%20Convex%20integration) with your project name to obtain an integration key. Key provisioning is currently assisted; the dashboard does not expose key management.

Operators of their own Askolia backend create a token through the authenticated backend mutation `integrationApi:createKey`, with `{ projectId, label }`. It returns `{ id, token }` once. `integrationApi:listKeys` returns metadata without token values; `integrationApi:revokeKey` takes `{ keyId }`. These are Askolia management functions, not functions in your consuming app. Do not use a Convex deployment admin key, session cookie or widget public key as the integration token.

## Use the client

```ts
import { Askolia } from "@appik-studio/askolia-convex";
import { components } from "./_generated/api";

export const askolia = new Askolia(components.askolia);
```

Call `search` and `ask` from actions:

```ts
const matches = await askolia.search(ctx, {
  query: "How long does delivery take?",
  locale: "en",
  limit: 5,
});

const result = await askolia.ask(ctx, {
  query: "Combien de temps prend la livraison ?",
  locale: "fr",
  clientId: visitorId,
});
if (result.kind === "answer") {
  console.log(result.answer, result.sources);
}
```

Use a stable caller identifier for `clientId`, containing 8–200 letters, digits, dots, underscores, colons or hyphens. Queries contain 2–200 characters; a search limit, when supplied, is an integer from 1 to 20. `ask` returns `answer`, `abstain` or `unavailable`; do not replace abstention with an invented answer. Search results contain `_id`, `question`, `answer` and optional `group` and `url`. AI sources use the same shape. Supported locales are `en`, `fr`, `de`, `es` and `it`.

The V1 `ask` API handles one question per call. It does not create a support conversation or maintain a conversation thread. AI answers remain subject to the Askolia project's plan, monthly generation allowance and rate limits.

## Synchronize public documents

Call `syncDocument` from the same mutation that writes the host data:

```ts
const id = await ctx.db.insert("articles", { title, content });
const revision = await askolia.syncDocument(ctx, {
  key: id,
  title,
  content,
});
```

Use the same stable `key` when updating the article. `syncDocument` returns the new revision number. If the host mutation fails, the document write, synchronization intent and scheduled worker roll back together. Remote delivery happens after commit and is eventually consistent.

Only send content intended for public search. Synchronized documents join the project's published knowledge, accessible through its public search and eligible AI answers. This component does not synchronize permissions or private user data. Authorize access in your host app before calling its methods or exposing wrappers to clients.

Documents require a nonblank key of at most 200 characters, a title of 1–200 characters and content of 1–100,000 UTF-8 bytes. Content is text or Markdown. PDF extraction and arbitrary file uploads are outside this V1. Documents are attributed by title; this V1 does not attach a source URL.

Remove content from the same mutation that removes the host record:

```ts
await ctx.db.delete(articleId);
await askolia.removeDocument(ctx, { key: articleId });
```

Each component instance has a persistent namespace. Revisions increase across updates and deletions. The server keeps deletion tombstones, so a delayed older write cannot resurrect a deleted document. Exact retries are idempotent. Reinstalling a component with a new namespace does not adopt or delete documents synchronized by its former instance.

Changes made directly in the Askolia dashboard do not flow back to your app. An exact retry returns the original acknowledgment even if an operator has since removed that document. A later `syncDocument` call creates a higher revision and republishes the current host content.

## Observe delivery

Expose an authorized host query that calls:

```ts
const state = await askolia.getSyncState(ctx, { key: articleId });
```

The query is reactive. It returns `null` before the first intent, or:

| Field | Meaning |
|---|---|
| `revision`, `operation` | Latest local intent and whether it is an upsert or removal |
| `status` | `pending`, `syncing`, `synced` or `failed` |
| `attempts` | Delivery attempts in the current retry budget, excluding HTTP 429 responses |
| `nextAttemptAt` | Scheduled retry time, when one exists |
| `lastError` | Sanitized delivery error, without document bodies or credentials |
| `lastSyncedAt`, `documentId` | Last successful acknowledgment and current remote document ID, when present |

`synced` means Askolia acknowledged the document mutation. It does not mean embeddings have finished or an AI answer is immediately available. Keyword indexing and knowledge preparation follow the backend's existing publication pipeline. A previous `lastSyncedAt` or `documentId` may remain while a newer revision is pending; check `status` and `revision` together.

Network failures, HTTP 408 and 5xx responses retry up to eight attempts. Delays start at five seconds and double up to five minutes. HTTP 429 responses wait 60–75 seconds and retry without consuming that budget. Other HTTP errors stop immediately. A one-minute lease and scheduled watchdog recover interrupted workers. After correcting a failed request or rotating credentials, call `retrySync(ctx, { key })` from a mutation. It retries the same revision with a fresh attempt budget. Update the document with `syncDocument` when its content needs correction.

To find failures across documents, expose an authorized query using `askolia.listFailed(ctx, { paginationOpts: { numItems: 10, cursor: null } })`. It returns `page`, `isDone` and `continueCursor`; pass the cursor to fetch the next page. Pages contain at most ten delivery states and exclude document content.

Delivered content is cleared from the component's outbox. Failed content remains for retries. Tombstones and delivery metadata remain. The component accepts up to 2,000 distinct keys per instance, including tombstones. Use stable business keys: deletion does not reclaim a key slot in this V1. Tombstones prevent delayed writes from recreating deleted content; there is no automatic garbage collection or namespace reset.

The server accepts 2,000 document mappings and ten active API keys per Askolia project. Search/ask share a 120-request-per-minute bucket; document writes have a separate 120-request-per-minute bucket, so a bulk synchronization does not consume search capacity. Askolia also retains its shared 500-document limit. These are separate limits.

## Test and build

```sh
bun run test
bun run typecheck
bun run build
```

`@appik-studio/askolia-convex/test` exports `schema` and `modules` for registering the component with `convex-test`. It requires a Vite-compatible test runner. A consuming app should test rollback of its own enclosing mutation and authorize any query that reveals synchronization state.

The `example/convex` app consumes the built package. Its article, search and state functions are internal to avoid exposing unauthenticated sample endpoints. Configure an isolated development deployment before running its CLI functions. Generated types are checked in; regenerating them requires the Convex component codegen workflow and a configured development deployment.

No npm publication, catalog submission or production deployment is performed by these build/test commands.

## Contributing

To contribute, clone this repository, run `bun install` and `bun run build`, then run `bun run check` before opening a pull request. Target `dev`; releases go from `dev` to `main`. Do not commit credentials or environment files. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

This package is licensed under the MIT license. See [LICENSE](./LICENSE).
