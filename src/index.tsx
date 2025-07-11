import { Hono } from "hono";

import { Page } from "./client/Page";
import { Shape, SHAPES } from "./client/Shape";
import { createDatastarStream } from "./hono-sse";

const app = new Hono();

// Keep track of the last selected shape index
let lastShapeIndex = -1;

app.get("/", (c) =>
  c.html(
    <Page>
      <Shape />
    </Page>
  )
);

app.get("/shape", () => {
  // Rotate to the next shape index
  lastShapeIndex = (lastShapeIndex + 1) % SHAPES.length;
  const nextShape = SHAPES[lastShapeIndex]!;

  return createDatastarStream((sse) => {
    sse.patchSignals({ shape: nextShape });
    sse.patchElements(<Shape shape={nextShape} />);
  });
});

export default app;
