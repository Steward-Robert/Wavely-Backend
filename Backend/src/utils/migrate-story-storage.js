import {
  ensurePrivateStoryBucket,
  getStoryStorageLocation,
  getStoryStorageReference,
  LEGACY_STORY_BUCKET,
  PRIVATE_STORY_BUCKET,
} from "./story-storage.js";

const STORAGE_BATCH_SIZE = 100;
const STORAGE_LIST_PAGE_SIZE = 1000;

const removeLegacyStoryFiles = async (storage) => {
  const paths = [];
  const listFolder = async (folder) => {
    let offset = 0;
    let items;

    do {
      const { data, error } = await storage
        .from(LEGACY_STORY_BUCKET)
        .list(folder, { limit: STORAGE_LIST_PAGE_SIZE, offset });
      if (error) {
        throw new Error(
          `Could not list legacy story files in ${folder}: ${error.message}`,
        );
      }

      items = data ?? [];
      for (const item of items) {
        const path = `${folder}/${item.name}`;
        if (item.id) {
          paths.push(path);
        } else {
          await listFolder(path);
        }
      }
      offset += items.length;
    } while (items.length === STORAGE_LIST_PAGE_SIZE);
  };

  await listFolder("Stories");

  for (let index = 0; index < paths.length; index += STORAGE_BATCH_SIZE) {
    const { error } = await storage
      .from(LEGACY_STORY_BUCKET)
      .remove(paths.slice(index, index + STORAGE_BATCH_SIZE));
    if (error) {
      throw new Error(`Could not remove legacy story files: ${error.message}`);
    }
  }

  return paths.length;
};

export const migrateStoryStorage = async (prisma, storage, logger = console) => {
  await ensurePrivateStoryBucket(storage);
  const stories = await prisma.story.findMany({
    select: { id: true, image: true },
  });
  let migratedCount = 0;

  for (const story of stories) {
    if (!story.image) continue;

    const location = getStoryStorageLocation(story.image);
    if (!location) {
      throw new Error(
        `Story ${story.id} has no supported storage location; no legacy files were removed.`,
      );
    }
    if (location.bucket === PRIVATE_STORY_BUCKET) continue;

    const { data, error: downloadError } = await storage
      .from(location.bucket)
      .download(location.path);
    if (downloadError || !data) {
      throw new Error(
        `Could not download media for story ${story.id}: ${downloadError?.message ?? "No file returned"}`,
      );
    }

    const { error: uploadError } = await storage
      .from(PRIVATE_STORY_BUCKET)
      .upload(location.path, Buffer.from(await data.arrayBuffer()), {
        contentType: data.type || "application/octet-stream",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(
        `Could not copy media for story ${story.id}: ${uploadError.message}`,
      );
    }

    await prisma.story.update({
      where: { id: story.id },
      data: { image: getStoryStorageReference(location.path) },
    });
    migratedCount += 1;
  }

  const removedCount = await removeLegacyStoryFiles(storage);
  logger.info?.(
    `Migrated ${migratedCount} stories and removed ${removedCount} legacy public story files.`,
  );
  return { migratedCount, removedCount };
};
