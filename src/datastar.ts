import type { Context } from "hono";
import type { Jsonifiable } from "type-fest";

// SSE headers for Datastar
const SSE_HEADERS = {
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
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
export class HonoDatastarSSE {
  private controller: ReadableStreamDefaultController<Uint8Array>;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  private sendEvent(
    eventType: string,
    dataLines: string[],
    options: DatastarEventOptions = {}
  ) {
    const { eventId, retryDuration } = options;

    let message = `event: ${eventType}\n`;

    if (eventId) {
      message += `id: ${eventId}\n`;
    }

    if (retryDuration && retryDuration !== 1000) {
      message += `retry: ${retryDuration}\n`;
    }

    message += dataLines.map((line) => `data: ${line}`).join("\n");
    message += "\n\n";

    this.controller.enqueue(new TextEncoder().encode(message));
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

/**
 * Read signals from client (same as ServerSentEventGenerator.readSignals)
 */
export async function readSignals(
  c: Context
): Promise<
  | { success: true; signals: Record<string, Jsonifiable> }
  | { success: false; error: string }
> {
  if (c.req.method === "GET") {
    const url = new URL(c.req.url);
    const params = url.searchParams;

    try {
      if (params.has("datastar")) {
        const datastarParam = params.get("datastar");
        if (!datastarParam) {
          throw new Error("Datastar param is null");
        }
        const signals = JSON.parse(datastarParam) as unknown;
        if (typeof signals === "object" && signals !== null) {
          return {
            success: true,
            signals: signals as Record<string, Jsonifiable>,
          };
        } else {
          throw new Error("Datastar param is not a record");
        }
      } else {
        throw new Error("No datastar object in request");
      }
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "message" in e &&
        typeof e.message === "string"
      ) {
        return { success: false, error: e.message };
      } else {
        return {
          success: false,
          error: "unknown error when parsing request",
        };
      }
    }
  }

  const body = await c.req.text();
  let parsedBody: Record<string, Jsonifiable> = {};

  try {
    if (typeof body !== "string") throw Error("body was not a string");
    parsedBody = JSON.parse(body) as Record<string, Jsonifiable>;
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "message" in e &&
      typeof e.message === "string"
    ) {
      return { success: false, error: e.message };
    } else {
      return {
        success: false,
        error: "unknown error when parsing request",
      };
    }
  }

  return { success: true, signals: parsedBody };
}
