import { z } from "zod";
import { incidentSeverities } from "./contracts";

export const createIncidentSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).transform((value) => value.trim() || undefined).optional(),
  severity: z.enum(incidentSeverities),
});
