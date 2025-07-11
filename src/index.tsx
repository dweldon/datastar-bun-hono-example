import { Hono } from "hono";

import { Page } from "./client/Page";
import { Shape, SHAPES } from "./client/Shape";
import { ServerSentEventGenerator } from "./serverSentEventGenerator";

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

app.get("/shape", async (c) => {
  const signals = await ServerSentEventGenerator.readSignals(c);
  console.log(signals);

  // Rotate to the next shape index
  lastShapeIndex = (lastShapeIndex + 1) % SHAPES.length;
  const nextShape = SHAPES[lastShapeIndex]!;

  return ServerSentEventGenerator.stream(c, async (stream) => {
    await stream.patchSignals({ signals: { shape: nextShape } });
    await Bun.sleep(200);
    await stream.patchElements({ elements: <Shape shape={nextShape} /> });
    await Bun.sleep(200);
    await stream.executeScript({
      script: `console.log("The shape is ${nextShape}")`,
    });
  });
});

export default app;
