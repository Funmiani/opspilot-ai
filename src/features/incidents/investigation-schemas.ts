import { z } from "zod";
import { commentKinds, incidentEvidenceTypes } from "./investigation-contracts";

// Installed Zod string bounds use code points; enforce approved UTF-16 bounds explicitly.
const utf16Bound = (max: number) => (value: string) => value.length <= max;

const sourceUrl = z.string()
  // Reject controls before trim/URL parsing can silently erase them.
  .refine(value => !/[\u0000-\u001f\u007f-\u009f]/.test(value), "Invalid source URL.")
  .trim().max(2048).refine(utf16Bound(2048), "Source URL is too long.")
  .transform(value => value || undefined)
  .refine(value => {
    if (value === undefined) return true;
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
    } catch { return false; }
  }, "Invalid source URL.");

export const addInvestigationNoteSchema = z.strictObject({
  body: z.string().trim().min(1).max(10_000).refine(utf16Bound(10_000), "Note body is too long."),
  kind: z.enum(commentKinds),
});
export const addIncidentEvidenceSchema = z.strictObject({
  type: z.enum(incidentEvidenceTypes),
  title: z.string().trim().min(1).max(200).refine(utf16Bound(200), "Evidence title is too long."),
  content: z.string().trim().min(1).max(20_000).refine(utf16Bound(20_000), "Evidence content is too long."),
  sourceUrl: sourceUrl.optional(),
});
