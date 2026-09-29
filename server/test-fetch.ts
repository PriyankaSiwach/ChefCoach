import { vi } from "vitest";

/** Real Response, so fakes match the `typeof fetch` that server code declares for `fetchImpl`. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Chat-completions reply whose message content is `content` (JSON-encoded unless already a string). */
export function openAiReply(content: unknown): Response {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return jsonResponse({ choices: [{ message: { content: text } }] });
}

/** A typed fetch mock: `mock.calls[i]` is `[input, init?]`. */
export function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn<typeof fetch>(impl);
}
