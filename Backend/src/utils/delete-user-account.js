import supabase from "../controller/spabse.js";
import { prisma } from "../db.js";
import { getPostStoragePaths } from "./post-storage.js";

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
    },
  });

  if (!user) return false;

  const postIds = user.posts.map((post) => post.id);
  const storagePaths = [
    ...user.posts.flatMap(getPostStoragePaths),
    ...user.stories.map((story) => getStoragePath(story.image, "Stories")),
    getStoragePath(user.avatar?.avatar, "Avatars"),
    ...user.reportsFiled.map((report) =>
      getStoragePath(report.attachmentUrl, "Reports"),
    ),
  ].filter(Boolean);

  for (let index = 0; index < storagePaths.length; index += 100) {
    const { error } = await supabase.storage
      .from("Wavely-Media")
      .remove(storagePaths.slice(index, index + 100));
    if (error) {
      console.error("Could not remove account media from storage:", error);
      throw new Error("Account media could not be deleted. Please try again.");
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
