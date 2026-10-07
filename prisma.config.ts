import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation and validation work without credentials. Database commands require
  // a real URL; do not substitute a dummy database or production credentials.
  datasource: { url: process.env.DATABASE_URL },
});
