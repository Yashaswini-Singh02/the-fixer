export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

/**
 * Minimal SSE client over fetch streaming. We roll our own (~50 lines)
 * instead of using EventSource because we need custom auth headers,
 * Last-Event-ID on reconnect, and access to the raw frames for recording.
 */
export async function* sseStream(
  url: string,
  opts: {
    headers?: Record<string, string>;
    lastEventId?: string;
    signal?: AbortSignal;
  } = {},
): AsyncGenerator<SseEvent> {
  const headers: Record<string, string> = {
    accept: "text/event-stream",
    ...opts.headers,
  };
  if (opts.lastEventId) headers["last-event-id"] = opts.lastEventId;

  const res = await fetch(url, { headers, signal: opts.signal });
  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf = (buf + value).replace(/\r\n/g, "\n");

    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);

      const evt: SseEvent = { event: "message", data: "" };
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        else if (line.startsWith("event:")) evt.event = line.slice(6).trim();
        else if (line.startsWith("id:")) evt.id = line.slice(3).trim();
        // comment lines (":keepalive") and unknown fields are ignored
      }
      evt.data = dataLines.join("\n");
      if (evt.data.length > 0 || evt.event !== "message") yield evt;
    }
  }
}
