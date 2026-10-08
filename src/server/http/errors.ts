import "server-only";
import { ApplicationError } from "@/server/application/errors";

export type ErrorPhase = "transport" | "authentication" | "tenant" | "operation";
export class TransportError extends Error {
  constructor(readonly status: 400 | 403 | 413 | 415) { super("Request rejected."); }
}

export function httpErrorResponse(error: unknown, phase: ErrorPhase): Response {
  let status = 500, code = "INTERNAL_ERROR", message = "The request could not be completed.";
  let issues: Array<{ field: string; message: string }> | undefined;
  if (error instanceof TransportError) {
    status = error.status;
    [code, message] = ({
      400: ["VALIDATION_FAILED", "The request is invalid."],
      403: ["FORBIDDEN", "The request is not permitted."],
      413: ["PAYLOAD_TOO_LARGE", "The request body is too large."],
      415: ["UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."],
    } as const)[status as 400 | 403 | 413 | 415];
  } else if (error instanceof ApplicationError) {
    code = error.code;
    switch (error.code) {
      case "VALIDATION_FAILED":
        status = 400; message = "The request is invalid.";
        // Never expose submitted property names or messages from Zod/internal errors.
        issues = error.issues?.slice(0, 5).map(issue => {
          const field = ["title", "description", "severity"].includes(issue.field) ? issue.field : "";
          return { field, message: field ? `Invalid ${field}.` : "The request contains invalid or unsupported fields." };
        });
        break;
      case "UNAUTHENTICATED": status = 401; message = "Authentication is required."; break;
      case "FORBIDDEN":
        status = phase === "tenant" ? 404 : 403;
        code = status === 404 ? "NOT_FOUND" : "FORBIDDEN";
        message = status === 404 ? "Resource not found." : "This operation is not permitted.";
        break;
      case "NOT_FOUND": status = 404; message = "Resource not found."; break;
      case "DATABASE_UNAVAILABLE": status = 503; message = "The service is temporarily unavailable."; break;
      case "INTERNAL_ERROR": break;
    }
  }
  // Causes remain attached to server-side errors; do not dump them into logs or JSON.
  return Response.json({ error: { code, message, ...(issues ? { issues } : {}) } },
    { status, headers: { "Cache-Control": "no-store" } });
}
