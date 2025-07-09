import { Hono } from "hono";

import { Page } from "./client/Page";
import { Shape, SHAPES } from "./client/Shape";
import { createDatastarStream } from "./datastar";

const app = new Hono();

app.get("/", (c) =>
  c.html(
    <Page>
      <Shape />
    </Page>
  )
);

app.get("/shape", () => {
  const randomIndex = Math.floor(Math.random() * SHAPES.length);
  const randomShape = SHAPES[randomIndex]!;

  return createDatastarStream((sse) => {
    sse.mergeSignals({ shape: randomShape });
    sse.mergeFragments(<Shape shape={randomShape} />);
  });
});

export default app;
