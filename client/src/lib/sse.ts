import { SseEventSchema, type SseEvent } from '@app/shared';
import { getToken, ApiError } from './api';

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Parses a Server-Sent Events stream from a ReadableStream<Uint8Array>.
 * Correctly handles:
 * - Chunk splits anywhere (across lines, words, multibyte characters)
 * - Multi-line `data:` entries (joined with `\n`)
 * - Comments / heartbeats (lines starting with `:`)
 * - Schema validation against @app/shared SseEventSchema
 * - Cancellation via AbortSignal
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let currentEventName = '';
  const currentDataLines: string[] = [];

  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        });
      })
    : null;

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

      const readPromise = reader.read();
      const result = abortPromise ? await Promise.race([readPromise, abortPromise]) : await readPromise;

      if (result.done) {
        // Flush any remaining line in buffer
        buffer += decoder.decode();
        if (buffer.length > 0) {
          processLine(buffer);
          buffer = '';
        }
        // Dispatch any final pending event
        const event = flushEvent();
        if (event) yield event;
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });

      // Split lines on \r\n, \r, or \n
      let lineStart = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char === '\n' || char === '\r') {
          const line = buffer.slice(lineStart, i);
          // Handle CRLF
          if (char === '\r' && buffer[i + 1] === '\n') {
            i++;
          }
          lineStart = i + 1;

          const event = processLine(line);
          if (event) {
            yield event;
          }
        }
      }

      buffer = buffer.slice(lineStart);
    }
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return;
    }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignored
    }
  }

  function processLine(rawLine: string): SseEvent | null {
    // Comments / heartbeats (lines starting with ':') are ignored
    if (rawLine.startsWith(':')) {
      return null;
    }

    // Empty line dispatches the event buffer
    if (rawLine === '') {
      return flushEvent();
    }

    const colonIndex = rawLine.indexOf(':');
    let field: string;
    let value = '';

    if (colonIndex === -1) {
      field = rawLine;
      value = '';
    } else {
      field = rawLine.slice(0, colonIndex);
      value = rawLine.slice(colonIndex + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
    }

    if (field === 'event') {
      currentEventName = value;
    } else if (field === 'data') {
      currentDataLines.push(value);
    }

    return null;
  }

  function flushEvent(): SseEvent | null {
    if (currentDataLines.length === 0 && !currentEventName) {
      return null;
    }

    const rawData = currentDataLines.join('\n');
    currentDataLines.length = 0;
    const eventName = currentEventName;
    currentEventName = '';

    if (!eventName && !rawData) {
      return null;
    }

    let parsedData: unknown = rawData;
    if (rawData) {
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        parsedData = rawData;
      }
    }

    const validated = SseEventSchema.parse({
      event: eventName,
      data: parsedData,
    });

    return validated;
  }
}

export interface StreamMessageOptions {
  conversationId: string;
  text: string;
  files?: File[];
  signal?: AbortSignal;
  onEvent?: (event: SseEvent) => void;
}

/**
 * Sends a chat message with optional files via multipart POST and streams SSE events.
 */
export async function streamMessage({
  conversationId,
  text,
  files = [],
  signal,
  onEvent,
}: StreamMessageOptions): Promise<void> {
  const formData = new FormData();
  formData.append('text', text);
  for (const file of files) {
    formData.append('files', file);
  }

  const token = getToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${base}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: formData,
    headers,
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('recall:unauthorized'));
    }
    let message = 'Failed to send message.';
    try {
      const json = await response.json();
      if (json?.error?.message) {
        message = json.error.message;
      }
    } catch {
      // Keep default message
    }
    throw new ApiError(message, response.status);
  }

  if (!response.body) {
    throw new ApiError('No response stream available.', 500);
  }

  for await (const event of parseSseStream(response.body, signal)) {
    onEvent?.(event);
  }
}
