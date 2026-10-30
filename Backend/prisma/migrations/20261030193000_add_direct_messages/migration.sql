CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userOneId" TEXT NOT NULL,
    "userTwoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Conversation_canonical_users_check"
        CHECK ("userOneId" COLLATE "C" < "userTwoId" COLLATE "C")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT,
    "attachmentPath" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Message_content_or_attachment_check" CHECK (
        (NULLIF(BTRIM("content"), '') IS NOT NULL) OR "attachmentPath" IS NOT NULL
    ),
    CONSTRAINT "Message_attachment_metadata_check" CHECK (
        ("attachmentPath" IS NULL AND "attachmentMimeType" IS NULL AND "attachmentName" IS NULL)
        OR
        ("attachmentPath" IS NOT NULL AND "attachmentMimeType" IS NOT NULL AND "attachmentName" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "Conversation_userOneId_userTwoId_key"
ON "Conversation"("userOneId", "userTwoId");

CREATE INDEX "Conversation_userOneId_updatedAt_idx"
ON "Conversation"("userOneId", "updatedAt");

CREATE INDEX "Conversation_userTwoId_updatedAt_idx"
ON "Conversation"("userTwoId", "updatedAt");

CREATE INDEX "Message_conversationId_createdAt_idx"
ON "Message"("conversationId", "createdAt");

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_userOneId_fkey"
FOREIGN KEY ("userOneId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_userTwoId_fkey"
FOREIGN KEY ("userTwoId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD CONSTRAINT "Message_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD CONSTRAINT "Message_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
