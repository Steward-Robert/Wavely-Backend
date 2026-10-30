export const PRIVATE_MESSAGE_BUCKET = "wavely-messages";

let privateBucketPromise;

export const ensurePrivateMessageBucket = (storage) => {
  if (!privateBucketPromise) {
    privateBucketPromise = (async () => {
      const { data: buckets, error: listError } = await storage.listBuckets();
      if (listError) {
        throw new Error(
          `Could not check message storage bucket: ${listError.message}`,
        );
      }

      const existingBucket = buckets.find(
        (bucket) => bucket.name === PRIVATE_MESSAGE_BUCKET,
      );
      if (existingBucket) {
        if (existingBucket.public) {
          throw new Error(
            `The ${PRIVATE_MESSAGE_BUCKET} bucket must be private.`,
          );
        }
        return;
      }

      const { error: createError } = await storage.createBucket(
        PRIVATE_MESSAGE_BUCKET,
        { public: false },
      );
      if (createError) {
        const { data: refreshedBuckets, error: refreshError } =
          await storage.listBuckets();
        const createdConcurrently = refreshedBuckets?.find(
          (bucket) => bucket.name === PRIVATE_MESSAGE_BUCKET,
        );
        if (
          refreshError ||
          !createdConcurrently ||
          createdConcurrently.public
        ) {
          throw new Error(
            `Could not create private message storage bucket: ${createError.message}`,
          );
        }
      }
    })();
  }

  return privateBucketPromise.catch((error) => {
    privateBucketPromise = undefined;
    throw error;
  });
};
