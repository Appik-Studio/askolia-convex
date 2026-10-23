# Convex demos

Run these commands from the repository root. The example imports the built
`@appik-studio/askolia-convex` package through its published exports and registers
the real component. Every function in `convex/demo.ts` is internal and callable
by an operator through the Convex CLI. The optional web demo is described below.


## Interactive web demo

[Open the hosted demo](https://appik-studio.github.io/askolia-convex/).
The source is in `web/` and `convex/webDemo.ts`. The frontend calls the actual
component through public Convex actions. It displays matching documents, AI
answers and their sources, and live delivery states for three fixed public guides.
It preserves abstention and unavailable outcomes.

To run your own copy, complete the development deployment setup below, then:

```sh
bunx --no-install convex env set --deployment dev ASKOLIA_DEMO_ENABLED 1
bunx --no-install convex run --deployment dev webDemo:seed '{}'
bunx --no-install convex run --deployment dev webDemo:status '{}'
```

Wait for each guide's latest revision to be `synced`. Indexing can finish later.
Create a private local `.env.local` in `example/web/` containing only the public
client URL of your consuming development deployment:

```dotenv
VITE_CONVEX_URL=https://your-development-deployment.convex.cloud
```

Then run `bun run demo:dev` from the repository root and open the printed URL.
The `.convex.cloud` URL is a public client address. It is different from the
Askolia HTTP API `.convex.site` origin configured on the server. Never put
`ASKOLIA_API_KEY` in a `VITE_` variable or frontend file.

`ASKOLIA_DEMO_ENABLED` is off by default. Enable it only on the development
backend used for the public demo. Search and ask share a global limit of 12
requests per minute and 100 per day. The server validates questions before
reserving that budget. Visitors cannot synchronize, retry or delete documents.
The delivery query exposes only the fixed demo guides' state, not credentials
or the component's other documents. The hosted demo uses a development project;
its content and availability can change.

Build static files with `bun run demo:build`. GitHub Pages publishes
`example/web/dist` from the public repository's `main` branch after checks pass.
The workflow uses repository variable `DEMO_CONVEX_URL` for the public client URL.
No integration key belongs in GitHub Pages or its workflow.

## Set up a development deployment

You need Bun, a Convex account, and access to a hosted Askolia service that
supports the V1 integration API. This repository contains the component and its
example, not the Askolia service.

1. Use the hosted public API origin listed in the
   [package setup](../README.md#configure-the-component). Contact
   [Appik Studio](mailto:contact@appik-studio.ch?subject=Askolia%20Convex%20integration)
   for an isolated demo project and assisted server integration key provisioning.
   The origin must serve `/api/v1/documents/sync`,
   `/api/v1/documents/remove`, `/api/v1/search`, and `/api/v1/ask`. Use the supplied
   `.convex.site` origin or custom API origin, without a path. The dashboard and
   `.convex.cloud` origins are not API origins for this component.
2. Receive the integration token through a private channel. Hosted key
   provisioning is assisted; the dashboard does not expose key management.
   This example cannot create a key. Use a project dedicated to development.
3. Install and build the package, then configure a new Convex project with a
   personal cloud development deployment:

   ```sh
   bun install
   bun run build
   bunx --no-install convex dev --configure new --dev-deployment cloud --once
   ```

   The CLI prompts for your Convex account and project. It creates local
   deployment configuration, generates API types, and pushes the example to
   your development deployment. Keep its generated local environment files
   private. This command is an operator step, not a recorded deployment.

4. Set the two deployment environment variables. Enter the supplied values at
   the interactive prompts, without adding them to shell commands or this repo:

   ```sh
   bunx --no-install convex env set --deployment dev ASKOLIA_URL
   bunx --no-install convex env set --deployment dev ASKOLIA_API_KEY
   ```

   `ASKOLIA_API_KEY` is the server integration token for the isolated Askolia
   project. A Convex admin key, session cookie, or widget key will not work.
   You can also set these values in that development deployment's Convex
   dashboard. Do not include the key in screenshots or saved demo output.

All commands below select your personal development deployment explicitly.
Use the same project and installed component for subsequent runs.

## Sync and inspect a revision

The demo uses the fixed business key `demo:shipping` and a fictional public
shipping policy. It does not create article records. The existing `articles.ts`
example is independent.

```sh
bunx --no-install convex run --deployment dev demo:status '{}'
bunx --no-install convex run --deployment dev demo:sync '{}'
bunx --no-install convex run --deployment dev demo:status '{}'
```

`status` returns `null` before the first intent. `sync` returns the key and the
new revision. Delivery runs after the mutation commits. Repeat `status` until
that revision has `operation: "upsert"` and `status: "synced"` before continuing.
`pending` and `syncing` are intermediate states. If it reports `failed`, follow
the retry steps below.

Illustrative output only, not a recorded live run:

```json
{ "key": "demo:shipping", "revision": 1 }
```

The eventual status includes `revision`, `operation`, `status`, `attempts`,
`lastSyncedAt`, and a `documentId`. A matching acknowledgment means the hosted
service accepted the write. Search indexing and AI knowledge preparation may
take longer. A prior `documentId` or `lastSyncedAt` alone does not prove that the
latest revision succeeded.

## Search and ask

```sh
bunx --no-install convex run --deployment dev demo:search '{"query":"demo shipping"}'
bunx --no-install convex run --deployment dev demo:ask '{"query":"When do demo orders ship?"}'
```

Search should eventually include the "Demo shipping policy" source. If the
matching revision is synced but search is empty, allow indexing to finish and
repeat the search. The project must have AI generation enabled and available
allowance for an answer. `ask` uses the stable client identifier
`askolia-cli-demo`.

The wrapper returns the complete result, including source references. These
are illustrative shapes; source IDs and generated wording vary:

```json
{
  "kind": "answer",
  "answer": "Demo orders ship within two business days [1].",
  "sources": [{
    "_id": "illustrative-source-id",
    "question": "Demo shipping policy",
    "answer": "Demo orders ship within two business days. Demo shipping is free."
  }]
}
```

```json
{ "kind": "abstain", "sources": [] }
```

```json
{ "kind": "unavailable", "sources": [] }
```

`answer` contains an answer and its sources. `abstain` means the service declined
to answer from the available knowledge. `unavailable` means the service could
not offer an AI answer. The service chooses the outcome; these commands do not
force one. Abstention and unavailable results may also include sources. Network,
configuration, and HTTP errors fail the CLI invocation and remain errors.

## Retry a failed delivery

Inspect the latest state:

```sh
bunx --no-install convex run --deployment dev demo:status '{}'
```

For `failed`, correct the cause before retrying. For example, ask the Askolia
team to check or rotate a rejected integration key, then update the development
deployment variable using the setup command. Do not deliberately break working
credentials to demonstrate a failure.

```sh
bunx --no-install convex run --deployment dev demo:retry '{}'
bunx --no-install convex run --deployment dev demo:status '{}'
```

`retry` returns `null` and schedules the same revision with a new attempt budget.
It handles both failed upserts and failed removals. Repeat `status` until the
same revision is synced. `retry` does nothing for a missing or nonfailed state.
Transient failures retry automatically up to eight attempts; rate limits wait
without consuming that budget. A retry request is not a delivery acknowledgment.

## Remove and verify cleanup

Keep the integration key configured until cleanup succeeds:

```sh
bunx --no-install convex run --deployment dev demo:remove '{}'
bunx --no-install convex run --deployment dev demo:status '{}'
```

`remove` returns a new revision. Record that number. Wait for that exact revision
to have `operation: "remove"` and `status: "synced"`, using `retry` if delivery
fails. For a fresh first run, the removal revision is usually `2`. Replace `2`
below with the value your removal command returned:

```sh
bunx --no-install convex run --deployment dev demo:verifyCleanup '{"revision":2}'
bunx --no-install convex run --deployment dev demo:search '{"query":"demo shipping"}'
```

`verifyCleanup` fails unless the latest state matches that exact removal
revision, is synced, and has no current remote `documentId`. Success returns the
retained tombstone state. This checks the component's remote deletion
acknowledgment. Search is a separate check of the hosted index. After indexing
catches up, the demo source should be absent. An isolated, otherwise empty
project should return `[]`. If other documents match, check that the removed
source ID is absent rather than requiring the whole result array to be empty.

Do not delete the Convex project or revoke the key before removal is
acknowledged. Deleting a deployment or revoking a key does not remove documents
already synchronized to Askolia. If the hosted service remains unavailable,
cleanup is incomplete; retain the deployment and ask the Askolia team for help.

Rerun `sync` to publish the same policy again. Revisions keep increasing, and the
business key and namespace stay the same. V1 tombstones consume permanent key
slots. Removal retains delivery metadata and does not reclaim a slot. Do not
generate a timestamp key or reinstall the component for every demo run.

## Test without a hosted service

After installing and building from the repository root:

```sh
bunx --no-install vitest run test/demo.test.ts
bunx --no-install tsc --noEmit -p example/convex/tsconfig.json
```

The focused `convex-test` suite runs the actual internal wrappers and component
with mocked HTTP responses. It checks repeated sync/search/remove cycles,
cleanup acknowledgment, stable keys and namespaces, failed delivery retries,
all three AI outcomes, and transport errors. It does not deploy code, provision
a hosted service, or prove live indexing or AI availability.
