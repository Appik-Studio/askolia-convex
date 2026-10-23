# Convex directory submission draft

This document is prepared for the [Convex submission form](https://www.convex.dev/components/submit). It does not indicate that a submission has been sent or approved.

## Links

| Field | Value |
| --- | --- |
| Name | Askolia |
| npm package | [@appik-studio/askolia-convex](https://www.npmjs.com/package/@appik-studio/askolia-convex) |
| Source | [Appik-Studio/askolia-convex](https://github.com/Appik-Studio/askolia-convex) |
| Homepage | [askolia.app](https://askolia.app) |
| Demo | [Runnable Convex example](https://github.com/Appik-Studio/askolia-convex/tree/main/example) |
| Guide | [English launch guide](https://askolia.app/blog/askolia-convex-component) |
| License | MIT |
| Maintainer | Appik Studio |

The demo link is a runnable CLI example. It is not a hosted interactive playground. It requires a development Convex deployment and a project integration key. The hosted website's visitor widget is a separate integration and is not presented as a demo of this package.

## Short description

Add website search and sourced AI answers to Convex actions. Synchronize public documents from your mutations with persistent retries and reactive delivery state.

## About Askolia

Askolia adds search, AI answers with sources and support chat to websites. This component connects a Convex application to an Askolia project's public knowledge.

Call `search` or `ask` from an action. Record `syncDocument` or `removeDocument` alongside your application's writes. The synchronization intent commits with the mutation, then a scheduled worker delivers it to Askolia. Failed network requests retry with backoff. Queries can observe delivery state and list failed documents.

The component is MIT licensed. The hosted Askolia service requires a separate account, project and integration key; AI answers depend on the project's plan and available allowance. Hosted integration keys are currently provisioned with help from Appik Studio.

## Benefits

- Retrieve matching public documents and generate answers with explicit sources from server actions.
- Commit synchronization intent with your application mutation. A rollback also rolls back the intent.
- Follow pending, syncing, synced and failed revisions through reactive queries.
- Recover interrupted deliveries with leases, fenced acknowledgments, backoff and manual retry.
- Use stable keys and monotonic revisions to prevent delayed writes from restoring removed documents.

## Use cases

### Add help search to a Convex application

Call `askolia.search(ctx, { query, locale, limit })` inside an authorized action and render the returned document titles and excerpts.

### Answer questions using a project's public knowledge

Call `askolia.ask(ctx, { query, locale, clientId })`. Render an answer with its sources, or preserve the `abstain` and `unavailable` outcomes. V1 handles one question per call and does not create a conversation thread.

### Keep published documents in sync

Call `syncDocument` in the same mutation that writes a public article. Call `removeDocument` in the mutation that removes it. Delivery happens after commit; it is not an atomic transaction across the application and the remote service.

## FAQ

### Can I synchronize private documents?

No. Synchronized documents enter the project's published knowledge and can appear in its public search and AI answers. V1 does not synchronize document permissions.

### What happens when delivery fails?

Network errors, HTTP 408 and 5xx responses retry up to eight attempts. Delays start at five seconds and cap at five minutes. HTTP 429 responses wait 60 to 75 seconds without consuming that retry budget. Other HTTP failures stop delivery until corrected. `getSyncState`, `listFailed` and `retrySync` support investigation and recovery.

### Does synced mean an AI answer is ready?

No. It confirms acknowledgment of the latest document revision. Knowledge preparation and embeddings may finish later.

### Does the component retain document content?

The outbox retains content until successful delivery, or while failed delivery needs a retry. It retains delivery metadata and deletion tombstones. V1 accepts 2,000 distinct keys per component instance, including tombstones; deletion does not reclaim a slot.

### What does the component require?

Convex 1.46 or newer, an Askolia project and server integration token, and an eligible Askolia plan for AI answers. The component supports English, French, German, Spanish and Italian locale values. The README describes payload and service limits.

## Before sending

- Confirm the public repository and npm links resolve.
- Confirm the example builds and its instructions match the current package.
- Use the example URL as the demo link, with its development setup requirements stated.
- Review the actual form's maintenance agreement before accepting it.
- Attach `docs/directory-thumbnail.png`, prepared at 1536 by 864 pixels. The editable SVG is included alongside it.
- Submit for Convex's review. Publication in the directory is subject to their approval.
