# datastar-bun-hono-example

This is a simple example of a [Datastar](https://data-star.dev/) app using
[Bun](https://bun.sh/) and [Hono](https://hono.dev/).

It should correctly implement the latest
[spec](https://github.com/starfederation/datastar/blob/main/sdk/ADR.md). Note:
this version has been extended to include heartbeats so bun/hono doesn't close
your connection prematurely when streaming.

The file you'll want to copy is [`datastar-sdk.ts`](src/datastar-sdk.ts). There
are no dependencies apart from hono.

If you find any issues, please report them here.

## Commands

```bash
bun install
bun dev
```

## Heartbeat example

Pass `heartbeatInterval` (milliseconds) to keep long-lived SSE connections open:

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

## LLM Docs

If you are looking for a companion set of distilled LLM reference docs for
Datastar, check out [these](https://github.com/dweldon/datastar-llm-reference).
