# Recorded service verification

On 23 October 2026, version 0.1.0 was exercised against a development Askolia service through its mounted Convex component. This is a record of an operator-run test, not an interactive playground or a claim that the example is already configured for your account.

The test used one temporary public document. Its content was: `The component verification code is amber-orchid. This public development document verifies synchronization.`

| Step | Observed result |
| --- | --- |
| Synchronize | Revision 1 reached `synced` on its first delivery attempt. |
| Search `amber-orchid` | Returned the test document's title and content. |
| Ask for the verification code | Returned `kind: "answer"` and `The component verification code is amber-orchid. [1]`, with the test document as its source. |
| Retry an acknowledged revision | Returned `null` without creating another revision. |
| List failed deliveries | Returned an empty page. |
| Remove | Revision 2 reached `synced` with `operation: "remove"` on its first delivery attempt. |
| Search after removal | No longer returned the document. |

Cleanup completed. The local deletion tombstone was retained as required by V1's revision handling. A separate normal Convex client without deployment-admin access was denied access to the host application's internal wrapper.

The automated test suite verifies retry, lease and rollback behavior without external services. This successful live run did not induce a network failure or test every retry branch. Follow the [example instructions](../example/README.md) to run a lifecycle against your own development configuration.
