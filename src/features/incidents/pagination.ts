import "server-only";
import { z } from "zod";

const cursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  createdAt: z.iso.datetime().refine(value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }),
  id: z.uuid(),
});

export const incidentPositionCursorSchema = z.string().min(1).max(256)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((value, ctx) => {
    try {
      const bytes = Buffer.from(value, "base64url");
      if (bytes.toString("base64url") !== value) throw new Error("Invalid encoding");
      const payload = cursorPayloadSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      return { createdAt: new Date(payload.createdAt), id: payload.id };
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid pagination cursor." });
      return z.NEVER;
    }
  });

// Position only: never carries tenant authority or requires a global row lookup.
export function encodeIncidentPositionCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ version: 1, createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

// Compatibility exports preserve existing Incident pagination behavior.
export const incidentCursorSchema = incidentPositionCursorSchema;
export const encodeIncidentCursor = encodeIncidentPositionCursor;
