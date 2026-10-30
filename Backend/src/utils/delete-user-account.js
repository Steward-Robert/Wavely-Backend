import supabase from "../controller/spabse.js";
import { prisma } from "../db.js";
import { getPostStoragePaths } from "./post-storage.js";
import {
  getStoryStorageLocation,
  LEGACY_STORY_BUCKET,
  PRIVATE_STORY_BUCKET,
} from "./story-storage.js";
import { PRIVATE_MESSAGE_BUCKET } from "./message-storage.js";

const getStoragePath = (publicUrl, folder) => {
  try {
    const segments = new URL(publicUrl).pathname.split("/");
    const folderIndex = segments.indexOf(folder);
    return folderIndex < 0
      ? null
      : segments.slice(folderIndex).map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
};

export const deleteUserAccount = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatar: { select: { avatar: true } },
      posts: {
        select: {
          id: true,
          image: true,
          media: { select: { url: true } },
        },
      },
      stories: { select: { image: true } },
      reportsFiled: { select: { attachmentUrl: true } },
      conversationsAsUserOne: {
        select: {
          messages: {
            select: { attachmentPath: true },
          },
        },
      },
      conversationsAsUserTwo: {
        select: {
          messages: {
            select: { attachmentPath: true },
          },
        },
      },
    },
  });

  if (!user) return false;

  const postIds = user.posts.map((post) => post.id);
  const storagePathsByBucket = new Map([
    [LEGACY_STORY_BUCKET, []],
    [PRIVATE_STORY_BUCKET, []],
  ]);
  const addStoragePath = (bucket, path) => {
    if (!path) return;
    if (!storagePathsByBucket.has(bucket)) {
      storagePathsByBucket.set(bucket, []);
    }
    storagePathsByBucket.get(bucket).push(path);
  };

  for (const post of user.posts) {
    for (const path of getPostStoragePaths(post)) {
      addStoragePath(LEGACY_STORY_BUCKET, path);
    }
  }
  for (const story of user.stories) {
    const location = getStoryStorageLocation(story.image);
    if (location) addStoragePath(location.bucket, location.path);
  }
  addStoragePath(
    LEGACY_STORY_BUCKET,
    getStoragePath(user.avatar?.avatar, "Avatars"),
  );
  for (const report of user.reportsFiled) {
    addStoragePath(
      LEGACY_STORY_BUCKET,
      getStoragePath(report.attachmentUrl, "Reports"),
    );
  }
  for (const conversation of [
    ...user.conversationsAsUserOne,
    ...user.conversationsAsUserTwo,
  ]) {
    for (const message of conversation.messages) {
      addStoragePath(PRIVATE_MESSAGE_BUCKET, message.attachmentPath);
    }
  }

  for (const [bucket, storagePaths] of storagePathsByBucket) {
    for (let index = 0; index < storagePaths.length; index += 100) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(storagePaths.slice(index, index + 100));
      if (error) {
        console.error("Could not remove account media from storage:", error);
        throw new Error("Account media could not be deleted. Please try again.");
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.deleteMany({
      where: {
        OR: [
          { authorId: userId },
          ...(postIds.length ? [{ postId: { in: postIds } }] : []),
        ],
      },
    });
    await tx.like.deleteMany({
      where: {
        OR: [
          { userId },
          ...(postIds.length ? [{ postId: { in: postIds } }] : []),
        ],
      },
    });
    await tx.saved.deleteMany({
      where: {
        OR: [
          { userID: userId },
          ...(postIds.length ? [{ postID: { in: postIds } }] : []),
        ],
      },
    });
    await tx.friendRequest.deleteMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    });
    await tx.friendship.deleteMany({
      where: { OR: [{ userId }, { friendId: userId }] },
    });
    await tx.report.updateMany({
      where: { handledById: userId },
      data: { handledById: null },
    });
    await tx.report.deleteMany({ where: { reporterId: userId } });
    await tx.avatar.deleteMany({ where: { ownerId: userId } });
    await tx.story.deleteMany({ where: { authorId: userId } });
    await tx.post.deleteMany({ where: { authorId: userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  return true;
};
