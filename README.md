# datastar-bun-hono-example

This is a simple example of a [Datastar](https://data-star.dev/) app using
[Bun](https://bun.sh/), and [Hono](https://hono.dev/).
See [`datastar-sdk`](src/datastar-sdk.ts) for the Hono SSE implementation.

It should correctly implement the latest [spec](https://github.com/starfederation/datastar/blob/main/sdk/ADR.md).
Note: this version has been extended to include heartbeats so bun/hono doesn't close your connection prematurely when streaming.

If you find any issues, please report them here or submit a PR.

```bash
bun i
bun dev
```

## Heartbeat example

Pass `heartbeatInterval` (in milliseconds) to keep long-lived SSE connections alive:

```ts
app.get('/updates', (c) => {
  return ServerSentEventGenerator.stream(
    c,
    async (sse) => {
      await sse.patchSignals({ signals: { status: 'processing' } });
      // ...long-running work
    },
    { heartbeatInterval: 15_000 }
  );
});
```
