-- CreateEnum
CREATE TYPE "CommentKind" AS ENUM ('NOTE', 'HYPOTHESIS', 'ACTION');

-- CreateEnum
CREATE TYPE "IncidentEvidenceType" AS ENUM ('LOG_EXCERPT', 'ERROR_MESSAGE', 'DEPLOYMENT_REFERENCE', 'MONITORING_ALERT', 'OBSERVATION', 'REFERENCE');

-- AlterEnum
ALTER TYPE "ActivityEventType" ADD VALUE 'EVIDENCE_ADDED';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "kind" "CommentKind" NOT NULL DEFAULT 'NOTE';

-- CreateTable
CREATE TABLE "IncidentEvidence" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "createdByMemberId" UUID NOT NULL,
    "type" "IncidentEvidenceType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentEvidence_organizationId_incidentId_createdAt_id_idx" ON "IncidentEvidence"("organizationId", "incidentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "IncidentEvidence_organizationId_createdByMemberId_idx" ON "IncidentEvidence"("organizationId", "createdByMemberId");

-- AddForeignKey
ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_organizationId_incidentId_fkey" FOREIGN KEY ("organizationId", "incidentId") REFERENCES "Incident"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_organizationId_createdByMemberId_fkey" FOREIGN KEY ("organizationId", "createdByMemberId") REFERENCES "OrganizationMember"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Domain storage bounds: Prisma does not express PostgreSQL CHECK constraints.
-- Length counts PostgreSQL characters; future application validation trims and
-- uses JavaScript/Zod semantics. Blank checks cover ordinary ASCII whitespace.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_body_bounds_check"
    CHECK (char_length("body") BETWEEN 1 AND 10000
        AND char_length(btrim("body", E' \t\n\r\f\013')) > 0);

ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_title_bounds_check"
    CHECK (char_length("title") BETWEEN 1 AND 200
        AND char_length(btrim("title", E' \t\n\r\f\013')) > 0);

ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_content_bounds_check"
    CHECK (char_length("content") BETWEEN 1 AND 20000
        AND char_length(btrim("content", E' \t\n\r\f\013')) > 0);

ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_sourceUrl_length_check"
    CHECK ("sourceUrl" IS NULL OR char_length("sourceUrl") <= 2048);
