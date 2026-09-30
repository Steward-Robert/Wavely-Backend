DELETE FROM "Avatar" AS duplicate
USING "Avatar" AS retained
WHERE duplicate."ownerId" = retained."ownerId"
  AND duplicate.id < retained.id;

CREATE UNIQUE INDEX "Avatar_ownerId_key" ON "Avatar"("ownerId");