import "server-only";
import { TransportError } from "./errors";

export const MAX_JSON_BYTES = 64 * 1024;
export function checkJsonRequest(request: Request, trustedOrigin: string, maxBytes = MAX_JSON_BYTES): void {
  const origin = request.headers.get("origin");
  // Exact equality also rejects null, paths, alternate spellings, and malformed origins.
  if (!origin || origin !== trustedOrigin || request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    throw new TransportError(403);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new TransportError(415);
  }
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) throw new TransportError(413);
}

export async function readBoundedJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  if (!request.body) throw new TransportError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new TransportError(413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new TransportError(400); }
}
