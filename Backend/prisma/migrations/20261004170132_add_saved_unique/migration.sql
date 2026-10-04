-- DropForeignKey
ALTER TABLE "Avatar" DROP CONSTRAINT "Avatar_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Story" DROP CONSTRAINT "Story_authorId_fkey";

-- CreateTable
CREATE TABLE "Saved" (
    "id" TEXT NOT NULL,
    "postID" TEXT NOT NULL,
    "userID" TEXT NOT NULL,
    "createAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Saved_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Saved_postID_userID_key" ON "Saved"("postID", "userID");

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saved" ADD CONSTRAINT "Saved_userID_fkey" FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saved" ADD CONSTRAINT "Saved_postID_fkey" FOREIGN KEY ("postID") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
