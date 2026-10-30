const storyVisibilityWhere = (userId, now = new Date()) => ({
  expiresAt: { gt: now },
  OR: [
    { authorId: userId },
    { author: { friendshipsInitiated: { some: { friendId: userId } } } },
    { author: { friendshipsReceived: { some: { userId } } } },
  ],
});

const findVisibleStories = (prisma, userId, now = new Date()) =>
  prisma.story.findMany({
    where: storyVisibilityWhere(userId, now),
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

const findVisibleStory = (prisma, storyId, userId, now = new Date()) =>
  prisma.story.findFirst({
    where: {
      id: storyId,
      ...storyVisibilityWhere(userId, now),
    },
    include: { author: { select: { id: true, name: true } } },
  });

export { findVisibleStories, findVisibleStory };
