import "server-only";
import { prisma } from "@/server/db/client";
import { makeCreateIncident } from "./create-incident";

export const createIncident = makeCreateIncident(prisma);
