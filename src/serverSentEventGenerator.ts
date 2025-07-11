import type { JsonObject } from 'type-fest';
import type { Context, HonoRequest } from 'hono';
import {
  streamSSE,
  type SSEMessage,
  type SSEStreamingApi,
} from 'hono/streaming';

// -----------------------------------------------------------------------------
// Stream
// -----------------------------------------------------------------------------

const EVENT_PATCH_SIGNALS = 'datastar-patch-signals';
const EVENT_PATCH_ELEMENTS = 'datastar-patch-elements';

type EventType = typeof EVENT_PATCH_SIGNALS | typeof EVENT_PATCH_ELEMENTS;

type DatastarSSEMessage = SSEMessage & {
  event: EventType;
};

type ElementPatchMode =
  | 'outer'
  | 'inner'
  | 'replace'
  | 'prepend'
  | 'append'
  | 'before'
  | 'after'
  | 'remove';

type PatchSignalsParameters = {
  signals: JsonObject;
  options?: {
    eventId?: string;
    onlyIfMissing?: boolean;
    retryDuration?: number;
  };
};

type PatchElementsParameters = {
  elements: unknown;
  options?: {
    mode?: ElementPatchMode;
    eventId?: string;
    selector?: string;
    retryDuration?: number;
    useViewTransition?: boolean;
  };
};

type ExecuteScriptParameters = {
  script: string;
  options?: {
    eventId?: string;
    attributes?: string[];
    autoRemove?: boolean;
    retryDuration?: number;
  };
};

class DatastarStreamingApi {
  private readonly stream: SSEStreamingApi;

  constructor(stream: SSEStreamingApi) {
    this.stream = stream;
  }

  public patchSignals({
    signals,
    options,
  }: PatchSignalsParameters): Promise<void> {
    const signalsString = JSON.stringify(signals);
    const signalsLines = this.prefixDataLines('signals', signalsString);
    const data = this.joinDataLines([
      ...(options?.onlyIfMissing
        ? this.prefixDataLines('onlyIfMissing', 'true')
        : []),
      ...signalsLines,
    ]);

    return this.send({
      id: options?.eventId,
      retry: options?.retryDuration,
      event: EVENT_PATCH_SIGNALS,
      data,
    });
  }

  public patchElements({
    elements,
    options,
  }: PatchElementsParameters): Promise<void> {
    const elementsString = String(elements);
    const elementsLines = this.prefixDataLines('elements', elementsString);
    const data = this.joinDataLines([
      ...(options?.mode && options.mode !== 'outer'
        ? this.prefixDataLines('mode', options.mode)
        : []),
      ...(options?.selector
        ? this.prefixDataLines('selector', options.selector)
        : []),
      ...(options?.useViewTransition === true
        ? this.prefixDataLines('useViewTransition', 'true')
        : []),
      ...elementsLines,
    ]);

    return this.send({
      id: options?.eventId,
      retry: options?.retryDuration,
      event: EVENT_PATCH_ELEMENTS,
      data,
    });
  }

  public executeScript({
    script,
    options,
  }: ExecuteScriptParameters): Promise<void> {
    const attributes: string[] = options?.attributes ?? [];
    if (options?.autoRemove !== false)
      attributes.push('data-effect="el.remove()"');

    const attributesString =
      attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
    const scriptElement = `<script${attributesString}>${script}</script>`;

    return this.patchElements({
      elements: scriptElement,
      options: {
        mode: 'append',
        selector: 'body',
        eventId: options?.eventId,
        retryDuration: options?.retryDuration,
      },
    });
  }

  private send(message: DatastarSSEMessage): Promise<void> {
    return this.stream.writeSSE(message);
  }

  private joinDataLines(dataLines: string[]): string {
    return dataLines.join('\n');
  }

  private prefixDataLines(prefix: string, data: string): string[] {
    return data.split('\n').map((line) => `${prefix} ${line}`);
  }
}

const stream = (
  c: Context,
  cb: (dsa: DatastarStreamingApi) => Promise<void>
): Response => {
  return streamSSE(c, async (stream) => {
    const dsa = new DatastarStreamingApi(stream);
    await cb(dsa);
  });
};

// -----------------------------------------------------------------------------
// Read Signals
// -----------------------------------------------------------------------------

type ReadSignalsError = {
  success: false;
  error: string;
};

type ReadSignalsSuccess = {
  success: true;
  signals: JsonObject;
};

type ReadSignalsResponse = ReadSignalsError | ReadSignalsSuccess;

const QUERY_PARAMETER = 'datastar';

const READ_SIGNALS_PARSE_ERROR: ReadSignalsError = {
  success: false,
  error: 'Unknown error while parsing request',
};

const readSignals = (c: Context): Promise<ReadSignalsResponse> => {
  return c.req.method === 'GET'
    ? Promise.resolve(readSignalsFromQuery(c.req as HonoRequest))
    : readSignalsFromBody(c.req as HonoRequest);
};

const readSignalsFromQuery = (req: HonoRequest): ReadSignalsResponse => {
  const queryString = req.query(QUERY_PARAMETER);
  if (!queryString) {
    return { success: false, error: 'No datastar object in request' };
  }

  try {
    const signals = JSON.parse(queryString) as JsonObject;
    return { success: true, signals };
  } catch (error) {
    return READ_SIGNALS_PARSE_ERROR;
  }
};

const readSignalsFromBody = async (
  req: HonoRequest
): Promise<ReadSignalsResponse> => {
  try {
    const signals = (await req.json()) as unknown as JsonObject;
    return { success: true, signals };
  } catch (error) {
    return READ_SIGNALS_PARSE_ERROR;
  }
};

// -----------------------------------------------------------------------------
// ServerSentEventGenerator
// -----------------------------------------------------------------------------

export const ServerSentEventGenerator = {
  stream,
  readSignals,
};
