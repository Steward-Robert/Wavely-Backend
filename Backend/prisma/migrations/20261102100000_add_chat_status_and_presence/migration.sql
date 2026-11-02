ALTER TABLE "User"
ADD COLUMN "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "Message"
ADD COLUMN "clientMessageId" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "readAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Message_clientMessageId_key"
ON "Message"("clientMessageId");

ALTER TABLE "Message"
ADD CONSTRAINT "Message_read_requires_delivery_check"
CHECK ("readAt" IS NULL OR "deliveredAt" IS NOT NULL);
