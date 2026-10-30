ALTER TABLE "Story"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "Story"
SET "expiresAt" = "createdAt" + INTERVAL '24 hours';

ALTER TABLE "Story"
ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");
