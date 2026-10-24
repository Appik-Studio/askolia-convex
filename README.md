<p align="center">
  <a href="https://askolia.app">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Appik-Studio/askolia-convex/main/docs/media/askolia-dark.svg" />
      <img src="https://raw.githubusercontent.com/Appik-Studio/askolia-convex/main/docs/media/askolia-light.svg" alt="Askolia" width="170" />
    </picture>
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.convex.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Appik-Studio/askolia-convex/main/docs/media/convex-dark.svg" />
      <img src="https://raw.githubusercontent.com/Appik-Studio/askolia-convex/main/docs/media/convex-light.svg" alt="Convex" width="190" />
    </picture>
  </a>
</p>

<h1 align="center">Askolia for Convex</h1>

<p align="center">Search your content. Answer with sources. Keep your documents in sync.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@appik-studio/askolia-convex"><img src="https://img.shields.io/npm/v/%40appik-studio%2Faskolia-convex?style=flat-square&amp;color=5145cd" alt="npm version" /></a>
  <a href="https://github.com/Appik-Studio/askolia-convex/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-5145cd?style=flat-square" alt="MIT license" /></a>
  <a href="https://docs.convex.dev/components"><img src="https://img.shields.io/badge/Convex-1.46%2B-5145cd?style=flat-square" alt="Requires Convex 1.46 or newer" /></a>
  <a href="https://github.com/Appik-Studio/askolia-convex/actions/workflows/ci.yml"><img src="https://github.com/Appik-Studio/askolia-convex/actions/workflows/ci.yml/badge.svg?branch=main" alt="Component checks" /></a>
  <a href="https://www.convex.dev/components/appik-studio/askolia-convex"><img src="https://www.convex.dev/components/badge/appik-studio/askolia-convex" alt="Convex component submission status" /></a>
</p>

<p align="center">
  <a href="https://appik-studio.github.io/askolia-convex/"><strong>Try the live demo</strong></a>
  &nbsp; · &nbsp;
  <a href="#configure-the-component">Quickstart</a>
  &nbsp; · &nbsp;
  <a href="https://github.com/Appik-Studio/askolia-convex/blob/main/example/README.md">Run the example</a>
</p>

<!-- START: Include on https://convex.dev/components -->

Add AI search to your Convex app with `@appik-studio/askolia-convex`.
Search published content, answer questions with sources, and synchronize public
documents from your mutations.

```sh
bun add @appik-studio/askolia-convex convex
```

| What you need | What the component does |
| --- | --- |
| Help users find a page | `search` returns matching documents and excerpts. |
| Answer a question | `ask` returns an answer with sources, or tells you when it cannot answer. |
| Keep content current | `syncDocument` and `removeDocument` record delivery intents with your mutations. |
| Follow delivery | Reactive state and persistent retries track each document revision. |

## See it in action

https://github.com/user-attachments/assets/448cb720-fd2e-4331-9216-e543df83e665

<details>
<summary>View a screenshot</summary>

[![Askolia demo showing a sourced answer and delivery states](https://raw.githubusercontent.com/Appik-Studio/askolia-convex/main/docs/media/demo.jpg)](https://appik-studio.github.io/askolia-convex/)

</details>

[Open the interactive demo](https://appik-studio.github.io/askolia-convex/) to try a
search or ask a question. The recording shows a real search, a sourced answer and
live delivery states. Shared demo request limits apply.

## Demo and guides

- [Run the web demo or Convex lifecycle example](https://github.com/Appik-Studio/askolia-convex/blob/main/example/README.md).
- Read the launch guide in [English](https://askolia.app/blog/askolia-convex-component), [French](https://askolia.app/fr/blog/composant-convex-askolia), or [German](https://askolia.app/de/blog/askolia-convex-komponente).
- [npm package](https://www.npmjs.com/package/@appik-studio/askolia-convex).

The component is MIT licensed. The hosted Askolia service requires an account,
project and server integration key. [Contact Appik Studio](mailto:contact@appik-studio.ch?subject=Askolia%20Convex%20integration)
for assisted key provisioning. Your Askolia backend must support the component's
integration API before documents can synchronize. Only synchronize public content.

<!-- END: Include on https://convex.dev/components -->

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

The `example/convex` app consumes the built package. Its article and lifecycle functions are internal. The optional `webDemo` module exposes bounded public search, AI answers and a projection of fixed demo delivery states. It is disabled unless `ASKOLIA_DEMO_ENABLED=1` is set on the server. Configure an isolated development deployment before enabling it or running CLI functions. Generated types are checked in; regenerating them requires the Convex component codegen workflow and a configured development deployment.

No npm publication, catalog submission or production deployment is performed by these build/test commands.

## Contributing

To contribute, clone this repository, run `bun install` and `bun run build`, then run `bun run check` before opening a pull request. Target `dev`; releases go from `dev` to `main`. Do not commit credentials or environment files. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

This package is licensed under the MIT license. See [LICENSE](./LICENSE).
