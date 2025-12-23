import type { FC, PropsWithChildren } from 'hono/jsx';

export const Page: FC<PropsWithChildren> = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Datastar-Bun-Hono-Example</title>
    </head>
    <body>
      <main data-signals:shape="">
        <p>Click the button to get a shape</p>
        <p style="display: none" data-show="$shape.length > 0">
          You got: <span data-text="$shape"></span>
        </p>
        {children}
        <button type="button" data-on:click="@get('/shape')">
          Get Shape
        </button>
      </main>
      <script
        type="module"
        src="https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.7/bundles/datastar.js"
      ></script>
    </body>
  </html>
);
