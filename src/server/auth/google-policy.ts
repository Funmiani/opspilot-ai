import "server-only";
import { APIError } from "better-auth/api";

export function normalizeGoogleName(name: unknown): string {
  return typeof name === "string" && name.trim() ? name.trim() : "OpsPilot user";
}

// Browser input may select no extra OAuth capabilities or redirect destinations.
export function enforceGoogleSignIn(body: Record<string, unknown>) {
  const allowed = new Set(["provider", "callbackURL", "newUserCallbackURL", "errorCallbackURL", "disableRedirect"]);
  if (body.provider !== "google" || Object.keys(body).some(key => !allowed.has(key)) ||
      (body.disableRedirect !== undefined && body.disableRedirect !== false)) {
    throw new APIError("BAD_REQUEST", { message: "Unsupported sign-in request." });
  }
  for (const [field, destination] of Object.entries({ callbackURL: "/app", newUserCallbackURL: "/app", errorCallbackURL: "/auth/error" })) {
    if (body[field] !== undefined && body[field] !== destination) {
      throw new APIError("BAD_REQUEST", { message: "Unsupported sign-in destination." });
    }
    body[field] = destination;
  }
}
