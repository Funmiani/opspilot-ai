import "server-only";
import { z } from "zod";
import { incidentCursorSchema } from "../pagination";

export const listIncidentsQuerySchema = z.strictObject({
  limit: z.string().max(3).regex(/^[0-9]+$/).transform(Number)
    .pipe(z.number().int().min(1).max(100)).default(20),
  cursor: incidentCursorSchema.optional(),
});
