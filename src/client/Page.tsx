import { type PropsWithChildren } from "hono/jsx";

export const Page = ({ children }: PropsWithChildren) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Datastar-Bun-Hono-Example</title>
    </head>
    <body>
      <main data-signals-shape="">
        <p>Click the button to get a shape</p>
        <p data-show="$shape.length > 0">
          You got: <span data-text="$shape"></span>
        </p>
        {children}
        <button data-on-click="@get('/shape')">Get Shape</button>
      </main>
      <script
        type="module"
        src="https://cdn.jsdelivr.net/gh/starfederation/datastar@main/bundles/datastar.js"
      ></script>
    </body>
  </html>
);
