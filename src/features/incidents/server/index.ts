import "server-only";
import { prisma } from "@/server/db/client";
import { makeIncidentReads } from "./read-incidents";
import { makeCreateIncident } from "./create-incident";

export const createIncident = makeCreateIncident(prisma);

export const { listIncidents, getIncident } = makeIncidentReads(prisma);
