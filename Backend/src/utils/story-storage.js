export const PRIVATE_STORY_BUCKET = "wavely-stories";
export const LEGACY_STORY_BUCKET = "Wavely-Media";

const PRIVATE_STORY_PREFIX = "private-story://";
let privateStoryBucketPromise;

export const getStoryStorageReference = (path) =>
  `${PRIVATE_STORY_PREFIX}${path}`;

export const getStoryStorageLocation = (image) => {
  if (typeof image !== "string" || !image) return null;

  if (image.startsWith(PRIVATE_STORY_PREFIX)) {
    const path = image.slice(PRIVATE_STORY_PREFIX.length);
    return path.startsWith("Stories/")
      ? { bucket: PRIVATE_STORY_BUCKET, path }
      : null;
  }

  try {
    const segments = new URL(image).pathname.split("/").filter(Boolean);
    const bucketIndex = segments.indexOf(LEGACY_STORY_BUCKET);
    const storyIndex = segments.indexOf("Stories", bucketIndex + 1);
    if (bucketIndex < 0 || storyIndex < 0) return null;

    return {
      bucket: LEGACY_STORY_BUCKET,
      path: segments.slice(storyIndex).map(decodeURIComponent).join("/"),
    };
  } catch {
    return null;
  }
};

export const ensurePrivateStoryBucket = (storage) => {
  if (!privateStoryBucketPromise) {
    privateStoryBucketPromise = (async () => {
      const { data: buckets, error: listError } = await storage.listBuckets();
      if (listError) {
        throw new Error(
          `Could not check story storage bucket: ${listError.message}`,
        );
      }

      const existingBucket = buckets.find(
        (bucket) => bucket.name === PRIVATE_STORY_BUCKET,
      );
      if (existingBucket) {
        if (existingBucket.public) {
          throw new Error(
            `The ${PRIVATE_STORY_BUCKET} bucket must be private before stories can be stored in it.`,
          );
        }
        return;
      }

      const { error: createError } = await storage.createBucket(
        PRIVATE_STORY_BUCKET,
        { public: false },
      );
      if (createError) {
        const { data: refreshedBuckets, error: refreshError } =
          await storage.listBuckets();
        const createdConcurrently = refreshedBuckets?.find(
          (bucket) => bucket.name === PRIVATE_STORY_BUCKET,
        );
        if (refreshError || !createdConcurrently || createdConcurrently.public) {
          throw new Error(
            `Could not create private story storage bucket: ${createError.message}`,
          );
        }
      }
    })();
  }

  return privateStoryBucketPromise.catch((error) => {
    privateStoryBucketPromise = undefined;
    throw error;
  });
};
