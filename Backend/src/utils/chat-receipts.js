import { findConversationForUser, getConversationPeerId } from "./chat-access.js";

export const markMessageDelivered = async (
  prisma,
  { messageId, conversationId, userId },
) => {
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversationId,
      senderId: { not: userId },
    },
    select: { senderId: true, deliveredAt: true, readAt: true },
  });
  if (!message) return null;

  const deliveredAt = message.deliveredAt ?? new Date();
  if (!message.deliveredAt) {
    await prisma.message.updateMany({
      where: {
        id: messageId,
        conversationId,
        senderId: message.senderId,
        deliveredAt: null,
      },
      data: { deliveredAt },
    });
  }
  return {
    senderId: message.senderId,
    messageIds: [messageId],
    deliveredAt,
    readAt: message.readAt,
  };
};

export const markConversationRead = async (
  prisma,
  { conversationId, userId, messageIds },
) => {
  const conversation = await findConversationForUser(
    prisma,
    conversationId,
    userId,
  );
  const peerId = conversation
    ? getConversationPeerId(conversation, userId)
    : null;
  if (!peerId) return null;

  const requestedMessageIds = Array.isArray(messageIds)
    ? [...new Set(messageIds.filter((id) => typeof id === "string"))].slice(
        0,
        100,
      )
    : [];
  if (requestedMessageIds.length === 0) return null;

  const unreadMessages = await prisma.message.findMany({
    where: {
      id: { in: requestedMessageIds },
      conversationId,
      senderId: peerId,
      readAt: null,
    },
    select: { id: true },
  });
  if (unreadMessages.length === 0) return null;

  const updatedMessageIds = unreadMessages.map((message) => message.id);
  const readAt = new Date();
  await prisma.message.updateMany({
    where: { id: { in: updatedMessageIds }, deliveredAt: null },
    data: { deliveredAt: readAt },
  });
  await prisma.message.updateMany({
    where: { id: { in: updatedMessageIds }, readAt: null },
    data: { readAt },
  });
  return {
    senderId: peerId,
    messageIds: updatedMessageIds,
    deliveredAt: readAt,
    readAt,
  };
};
