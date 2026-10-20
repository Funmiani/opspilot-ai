import "server-only";
import { makeInvestigationNotes } from "./investigation-notes";
import { makeIncidentEvidence } from "./incident-evidence";
import { prisma } from "@/server/db/client";
import { makeIncidentReads } from "./read-incidents";
import { makeCreateIncident } from "./create-incident";

export const createIncident = makeCreateIncident(prisma);

export const { listIncidents, getIncident } = makeIncidentReads(prisma);

export const { addInvestigationNote, listInvestigationNotes } = makeInvestigationNotes(prisma);
export const { addIncidentEvidence, listIncidentEvidence } = makeIncidentEvidence(prisma);
