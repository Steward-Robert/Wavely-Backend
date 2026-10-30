export const getConversationUserIds = (firstUserId, secondUserId) =>
  [firstUserId, secondUserId].sort();

export const acceptedFriendshipWhere = (firstUserId, secondUserId) => ({
  OR: [
    { userId: firstUserId, friendId: secondUserId },
    { userId: secondUserId, friendId: firstUserId },
  ],
});

export const findAcceptedFriendship = (prisma, firstUserId, secondUserId) => {
  if (!firstUserId || !secondUserId || firstUserId === secondUserId) {
    return Promise.resolve(null);
  }

  return prisma.friendship.findFirst({
    where: acceptedFriendshipWhere(firstUserId, secondUserId),
    select: { id: true },
  });
};

export const hasActiveFriendAccess = async (
  prisma,
  firstUserId,
  secondUserId,
) => {
  if (!firstUserId || !secondUserId || firstUserId === secondUserId) {
    return false;
  }

  const [friendship, activePeer] = await Promise.all([
    findAcceptedFriendship(prisma, firstUserId, secondUserId),
    prisma.user.findFirst({
      where: { id: secondUserId, isActive: true },
      select: { id: true },
    }),
  ]);
  return Boolean(friendship && activePeer);
};

export const findConversationForUser = (prisma, conversationId, userId) =>
  prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ userOneId: userId }, { userTwoId: userId }],
    },
  });

export const getConversationPeerId = (conversation, userId) => {
  if (conversation.userOneId === userId) return conversation.userTwoId;
  if (conversation.userTwoId === userId) return conversation.userOneId;
  return null;
};

export const toMessageResponse = (message) => ({
  id: message.id,
  conversationId: message.conversationId,
  content: message.content,
  createdAt: message.createdAt,
  sender: message.sender,
  attachment:
    message.attachmentPath && message.attachmentMimeType && message.attachmentName
      ? {
          name: message.attachmentName,
          mimeType: message.attachmentMimeType,
          mediaUrl: `/api/chat/messages/${encodeURIComponent(message.id)}/media`,
        }
      : null,
});
