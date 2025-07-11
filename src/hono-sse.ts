import type { Jsonifiable } from "type-fest";

// SSE headers for Datastar
const SSE_HEADERS = {
  "Cache-Control": "no-cache",
  "Content-Type": "text/event-stream",
} as const;

// Datastar event types
const EVENT_TYPES = {
  PATCH_SIGNALS: "datastar-patch-signals",
  PATCH_ELEMENTS: "datastar-patch-elements",
} as const;

// Other constants
const DEFAULT_RETRY_DURATION = 1000;

interface DatastarEventOptions {
  eventId?: string;
  retryDuration?: number;
}

interface PatchElementsOptions extends DatastarEventOptions {
  selector?: string;
  mode?:
    | "outer"
    | "inner"
    | "replace"
    | "prepend"
    | "append"
    | "before"
    | "after"
    | "remove";
  useViewTransition?: boolean;
}

interface PatchSignalsOptions extends DatastarEventOptions {
  onlyIfMissing?: boolean;
}

interface ExecuteScriptOptions extends DatastarEventOptions {
  attributes?: string[];
  autoRemove?: boolean;
}

/**
 * Direct Hono SSE implementation for Datastar
 * This replaces the ServerSentEventGenerator with native Hono SSE capabilities
 */
class HonoDatastarSSE {
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private encoder: TextEncoder;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
    this.encoder = new TextEncoder();
  }

  private sendEvent(
    eventType: string,
    dataLines: string[],
    options: DatastarEventOptions = {}
  ) {
    const { eventId, retryDuration } = options;
    const messageParts: string[] = [`event: ${eventType}`];

    if (eventId) {
      messageParts.push(`id: ${eventId}`);
    }

    if (retryDuration && retryDuration !== DEFAULT_RETRY_DURATION) {
      messageParts.push(`retry: ${retryDuration}`);
    }

    // Add data lines
    dataLines.forEach((line) => messageParts.push(`data: ${line}`));

    // Add final newlines
    messageParts.push("", "");

    const message = messageParts.join("\n");
    this.controller.enqueue(this.encoder.encode(message));
  }

  /**
   * Send a patch signals event
   */
  patchSignals(
    signals: Record<string, Jsonifiable>,
    options?: PatchSignalsOptions
  ) {
    const dataLines = [`signals ${JSON.stringify(signals)}`];

    if (options?.onlyIfMissing) {
      dataLines.push(`onlyIfMissing ${options.onlyIfMissing}`);
    }

    this.sendEvent(EVENT_TYPES.PATCH_SIGNALS, dataLines, options);
  }

  /**
   * Send a patch elements event
   */
  patchElements(elements: string | Element, options?: PatchElementsOptions) {
    const dataLines: string[] = [];

    if (options?.selector) {
      dataLines.push(`selector ${options.selector}`);
    }

    if (options?.mode && options.mode !== "outer") {
      dataLines.push(`mode ${options.mode}`);
    }

    if (options?.useViewTransition) {
      dataLines.push(`useViewTransition ${options.useViewTransition}`);
    }

    // Convert Element to string if needed, then split by lines and add each line
    const elementsString =
      typeof elements === "string" ? elements : elements.toString();
    const elementLines = elementsString
      .split("\n")
      .filter((line: string) => line.trim());
    elementLines.forEach((line: string) => {
      dataLines.push(`elements ${line}`);
    });

    this.sendEvent(EVENT_TYPES.PATCH_ELEMENTS, dataLines, options);
  }

  /**
   * Send an execute script event
   */
  executeScript(script: string, options?: ExecuteScriptOptions) {
    const { autoRemove = true, attributes = [] } = options || {};

    // Build script tag with attributes
    let scriptTag = "<script";

    if (autoRemove) {
      scriptTag += ' data-effect="el.remove()"';
    }

    attributes.forEach((attr) => {
      scriptTag += ` ${attr}`;
    });

    scriptTag += `>${script}</script>`;

    // Use patchElements with append mode to body
    this.patchElements(scriptTag, {
      selector: "body",
      mode: "append",
      ...options,
    });
  }

  /**
   * Close the stream
   */
  close() {
    this.controller.close();
  }
}

/**
 * Create a Datastar SSE stream with Hono
 */
export const createDatastarStream = (
  onStart: (sse: HonoDatastarSSE) => Promise<void> | void,
  options?: {
    onError?: (error: unknown) => Promise<void> | void;
    onAbort?: () => Promise<void> | void;
    keepalive?: boolean;
  }
) => {
  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const sse = new HonoDatastarSSE(controller);

      try {
        const result = onStart(sse);
        if (result instanceof Promise) {
          await result;
        }

        if (!options?.keepalive) {
          sse.close();
        }
      } catch (error) {
        if (options?.onError) {
          await options.onError(error);
        }
        sse.close();
      }
    },
    cancel: async () => {
      if (options?.onAbort) {
        await options.onAbort();
      }
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
};
