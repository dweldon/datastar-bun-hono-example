import type { Jsonifiable } from "type-fest";

// SSE headers for Datastar
const SSE_HEADERS = {
  Connection: "keep-alive",
  "Cache-Control": "no-cache",
  "Content-Type": "text/event-stream",
} as const;

// Datastar event types
const EVENT_TYPES = {
  MERGE_SIGNALS: "datastar-merge-signals",
  MERGE_FRAGMENTS: "datastar-merge-fragments",
  REMOVE_FRAGMENTS: "datastar-remove-fragments",
  REMOVE_SIGNALS: "datastar-remove-signals",
  EXECUTE_SCRIPT: "datastar-execute-script",
} as const;

// Other constants
const DEFAULT_RETRY_DURATION = 1000;

interface DatastarEventOptions {
  eventId?: string;
  retryDuration?: number;
}

interface MergeFragmentsOptions extends DatastarEventOptions {
  selector?: string;
  mergeMode?:
    | "morph"
    | "inner"
    | "outer"
    | "prepend"
    | "append"
    | "before"
    | "after"
    | "upsertAttributes";
  useViewTransition?: boolean;
}

interface MergeSignalsOptions extends DatastarEventOptions {
  onlyIfMissing?: boolean;
}

interface ExecuteScriptOptions extends DatastarEventOptions {
  attributes?: Record<string, string> | string[];
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
   * Send a merge signals event
   */
  mergeSignals(
    signals: Record<string, Jsonifiable>,
    options?: MergeSignalsOptions
  ) {
    const dataLines = [`signals ${JSON.stringify(signals)}`];

    if (options?.onlyIfMissing) {
      dataLines.push(`onlyIfMissing ${options.onlyIfMissing}`);
    }

    this.sendEvent(EVENT_TYPES.MERGE_SIGNALS, dataLines, options);
  }

  /**
   * Send a merge fragments event
   */
  mergeFragments(fragments: unknown, options?: MergeFragmentsOptions) {
    const dataLines = [`fragments ${String(fragments)}`];

    if (options?.selector) {
      dataLines.push(`selector ${options.selector}`);
    }

    if (options?.mergeMode && options.mergeMode !== "morph") {
      dataLines.push(`mergeMode ${options.mergeMode}`);
    }

    if (options?.useViewTransition) {
      dataLines.push(`useViewTransition ${options.useViewTransition}`);
    }

    this.sendEvent(EVENT_TYPES.MERGE_FRAGMENTS, dataLines, options);
  }

  /**
   * Send a remove fragments event
   */
  removeFragments(selector: string, options?: DatastarEventOptions) {
    this.sendEvent(
      EVENT_TYPES.REMOVE_FRAGMENTS,
      [`selector ${selector}`],
      options
    );
  }

  /**
   * Send a remove signals event
   */
  removeSignals(paths: string[], options?: DatastarEventOptions) {
    const dataLines = paths.map((path) => `paths ${path}`);
    this.sendEvent(EVENT_TYPES.REMOVE_SIGNALS, dataLines, options);
  }

  /**
   * Send an execute script event
   */
  executeScript(script: string, options?: ExecuteScriptOptions) {
    const dataLines = [`script ${script}`];

    if (options?.attributes) {
      if (Array.isArray(options.attributes)) {
        options.attributes.forEach((attr) => {
          dataLines.push(`attributes ${attr}`);
        });
      } else {
        Object.entries(options.attributes).forEach(([key, value]) => {
          dataLines.push(`attributes ${key} ${value}`);
        });
      }
    }

    if (options?.autoRemove !== undefined) {
      dataLines.push(`autoRemove ${options.autoRemove}`);
    }

    this.sendEvent(EVENT_TYPES.EXECUTE_SCRIPT, dataLines, options);
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
export function createDatastarStream(
  onStart: (sse: HonoDatastarSSE) => Promise<void> | void,
  options?: {
    onError?: (error: unknown) => Promise<void> | void;
    onAbort?: () => Promise<void> | void;
    keepalive?: boolean;
  }
) {
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
}
