/*
  Warnings:

  - You are about to drop the column `image` on the `Avatar` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Avatar" DROP COLUMN "image",
ADD COLUMN     "avatar" TEXT;
