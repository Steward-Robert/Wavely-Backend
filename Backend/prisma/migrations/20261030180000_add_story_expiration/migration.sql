ALTER TABLE "Story"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "Story"
SET "expiresAt" = "createdAt" + INTERVAL '24 hours';

ALTER TABLE "Story"
ALTER COLUMN "expiresAt" SET NOT NULL;

ALTER TABLE "Story"
ALTER COLUMN "expiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');

CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");
