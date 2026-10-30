import "dotenv/config";
import supabase from "../src/controller/spabse.js";
import { prisma } from "../src/db.js";
import { migrateStoryStorage } from "../src/utils/migrate-story-storage.js";

try {
  await migrateStoryStorage(prisma, supabase.storage);
} catch (error) {
  console.error("Story storage migration failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
