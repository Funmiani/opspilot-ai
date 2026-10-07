import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapDevWorkspace, checkLocalDevelopment, parseBootstrapArgs } from "./bootstrap-dev-workspace-logic";

config({quiet: true});
let db: PrismaClient | undefined;
try {
  checkLocalDevelopment(process.env);
  parseBootstrapArgs(process.argv.slice(2));
  // Standalone administrative process; the app's server-only singleton is not imported.
  db = new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 1})});
  const result = await bootstrapDevWorkspace(db, process.argv.slice(2), process.env);
  console.log(`Workspace created successfully.\nName: ${result.name}\nOrganization ID: ${result.id}\nMembership role: ${result.role}`);
} catch {
  // Never print Prisma causes or connection settings in CLI output.
  console.error("Bootstrap failed. Check development target, explicit inputs, active User, and unused slug. No partial workspace was created.");
  process.exitCode = 1;
} finally { await db?.$disconnect(); }
