import { randomUUID } from "node:crypto";
import multer from "multer";
import supabase from "./spabse.js";
import { prisma } from "../db.js";
import {
  findAcceptedFriendship,
  findConversationForUser,
  getConversationPeerId,
  getConversationUserIds,
  hasActiveFriendAccess,
  toMessageResponse,
} from "../utils/chat-access.js";
import {
  ensurePrivateMessageBucket,
  PRIVATE_MESSAGE_BUCKET,
} from "../utils/message-storage.js";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
]);

const messageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.mimetype)) {
      return callback(new Error("Unsupported message attachment type."));
    }
    callback(null, true);
  },
});

export const uploadMessageAttachment = (req, res, next) => {
  messageUpload.single("attachment")(req, res, (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Attachments must be 10 MB or smaller."
          : error.code === "LIMIT_FILE_COUNT"
            ? "Only one attachment is allowed per message."
            : error.message;
      return res.status(400).json({ message });
    }
    next();
  });
};

const findAccessibleConversation = async (conversationId, userId) => {
  const conversation = await findConversationForUser(
    prisma,
    conversationId,
    userId,
  );
  if (!conversation) return null;

  const peerId = getConversationPeerId(conversation, userId);
  if (!peerId || !(await hasActiveFriendAccess(prisma, userId, peerId))) {
    return null;
  }

  return { conversation, peerId };
};

export const requireConversationAccess = async (req, res, next) => {
  try {
    const accessible = await findAccessibleConversation(
      req.params.conversationId,
      req.user.id,
    );
    if (!accessible) {
      return res.status(404).json({ message: "Conversation not found." });
    }
    req.chatConversation = accessible.conversation;
    req.chatPeerId = accessible.peerId;
    next();
  } catch (error) {
    console.error("Could not verify conversation access:", error);
    return res.status(500).json({ message: "Unable to access conversation." });
  }
};

const conversationIncludes = {
  userOne: {
    select: { id: true, name: true, avatar: { select: { avatar: true } } },
  },
  userTwo: {
    select: { id: true, name: true, avatar: { select: { avatar: true } } },
  },
  messages: {
    take: 1,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      content: true,
      attachmentName: true,
      createdAt: true,
      senderId: true,
    },
  },
};

export const allChatFriends = async (req, res) => {
  try {
    const userId = req.user.id;
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            isActive: true,
            avatar: { select: { avatar: true } },
          },
        },
        friend: {
          select: {
            id: true,
            name: true,
            isActive: true,
            avatar: { select: { avatar: true } },
          },
        },
      },
    });

    const seen = new Set();
    const friends = friendships
      .map((friendship) =>
        friendship.userId === userId ? friendship.friend : friendship.user,
      )
      .filter((friend) => {
        if (!friend.isActive || seen.has(friend.id)) return false;
        seen.add(friend.id);
        return true;
      })
      .map(({ isActive, ...friend }) => friend);

    return res.status(200).json({ friends });
  } catch (error) {
    console.error("Could not load chat friends:", error);
    return res.status(500).json({ message: "Unable to load friends." });
  }
};

export const allConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const activeFriendWhere = {
      isActive: true,
      OR: [
        { friendshipsInitiated: { some: { friendId: userId } } },
        { friendshipsReceived: { some: { userId } } },
      ],
    };

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          {
            userOneId: userId,
            userTwo: { is: activeFriendWhere },
          },
          {
            userTwoId: userId,
            userOne: { is: activeFriendWhere },
          },
        ],
      },
      include: conversationIncludes,
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        friend:
          conversation.userOneId === userId
            ? conversation.userTwo
            : conversation.userOne,
        updatedAt: conversation.updatedAt,
        lastMessage: conversation.messages[0] ?? null,
      })),
    });
  } catch (error) {
    console.error("Could not load conversations:", error);
    return res.status(500).json({ message: "Unable to load conversations." });
  }
};

export const createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.body?.friendId;
    if (typeof friendId !== "string" || !friendId || friendId === userId) {
      return res.status(400).json({ message: "Choose a valid friend." });
    }

    const friendship = await findAcceptedFriendship(prisma, userId, friendId);
    if (!friendship) {
      return res.status(404).json({ message: "Friend not found." });
    }

    const friend = await prisma.user.findFirst({
      where: { id: friendId, isActive: true },
      select: { id: true },
    });
    if (!friend) {
      return res.status(404).json({ message: "Friend not found." });
    }

    const [userOneId, userTwoId] = getConversationUserIds(userId, friendId);
    const conversation = await prisma.conversation.upsert({
      where: { userOneId_userTwoId: { userOneId, userTwoId } },
      create: { userOneId, userTwoId },
      update: {},
      include: conversationIncludes,
    });
    const participant = userOneId === userId
      ? conversation.userTwo
      : conversation.userOne;

    return res.status(200).json({
      conversation: {
        id: conversation.id,
        friend: participant,
        updatedAt: conversation.updatedAt,
        lastMessage: conversation.messages[0] ?? null,
      },
    });
  } catch (error) {
    console.error("Could not create conversation:", error);
    return res.status(500).json({ message: "Unable to start conversation." });
  }
};

export const conversationMessages = async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: req.chatConversation.id },
      include: {
        sender: {
          select: { id: true, name: true, avatar: { select: { avatar: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return res.status(200).json({
      messages: messages.reverse().map(toMessageResponse),
    });
  } catch (error) {
    console.error("Could not load conversation messages:", error);
    return res.status(500).json({ message: "Unable to load messages." });
  }
};

export const sendMessage = async (req, res) => {
  const file = req.file;
  let uploadedPath;
  let persisted = false;

  try {
    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      });
    }
    if (!content && !file) {
      return res.status(400).json({
        message: "Write a message or attach a file.",
      });
    }

    let attachmentData = {};
    if (file) {
      await ensurePrivateMessageBucket(supabase.storage);
      uploadedPath = `Messages/${req.chatConversation.id}/${randomUUID()}`;
      const { error: uploadError } = await supabase.storage
        .from(PRIVATE_MESSAGE_BUCKET)
        .upload(uploadedPath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });
      if (uploadError) {
        throw new Error(`Could not upload message attachment: ${uploadError.message}`);
      }
      attachmentData = {
        attachmentPath: uploadedPath,
        attachmentMimeType: file.mimetype,
        attachmentName: file.originalname.slice(0, 255),
      };
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: req.chatConversation.id,
          senderId: req.user.id,
          content: content || null,
          ...attachmentData,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatar: { select: { avatar: true } },
            },
          },
        },
      });
      await tx.conversation.update({
        where: { id: req.chatConversation.id },
        data: { updatedAt: new Date() },
      });
      return created;
    });
    persisted = true;

    const responseMessage = toMessageResponse(message);
    try {
      const friendshipStillAccepted = await hasActiveFriendAccess(
        prisma,
        req.user.id,
        req.chatPeerId,
      );
      if (friendshipStillAccepted) {
        req.app
          .get("io")
          ?.to([`user:${req.user.id}`, `user:${req.chatPeerId}`])
          .emit("chat:message", responseMessage);
      }
    } catch (error) {
      console.error("Could not notify connected chat clients:", error);
    }

    return res.status(201).json({ message: responseMessage });
  } catch (error) {
    if (uploadedPath && !persisted) {
      try {
        const { error: cleanupError } = await supabase.storage
          .from(PRIVATE_MESSAGE_BUCKET)
          .remove([uploadedPath]);
        if (cleanupError) {
          console.error(
            "Could not remove failed message attachment:",
            cleanupError,
          );
        }
      } catch (cleanupError) {
        console.error("Could not remove failed message attachment:", cleanupError);
      }
    }
    console.error("Could not send message:", error);
    return res.status(500).json({ message: "Unable to send message." });
  }
};

export const getMessageMedia = async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: {
        conversation: {
          select: { id: true, userOneId: true, userTwoId: true },
        },
      },
    });
    if (!message?.attachmentPath) {
      return res.status(404).json({ message: "Attachment not found." });
    }

    const userId = req.user.id;
    const peerId = getConversationPeerId(message.conversation, userId);
    if (
      !peerId ||
      !(await hasActiveFriendAccess(prisma, userId, peerId))
    ) {
      return res.status(404).json({ message: "Attachment not found." });
    }

    const { data, error } = await supabase.storage
      .from(PRIVATE_MESSAGE_BUCKET)
      .download(message.attachmentPath);
    if (error) {
      console.error("Could not download message attachment:", error);
      return res.status(404).json({ message: "Attachment not found." });
    }

    const safeName = encodeURIComponent(message.attachmentName).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Type": message.attachmentMimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${safeName}`,
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).send(Buffer.from(await data.arrayBuffer()));
  } catch (error) {
    console.error("Could not access message attachment:", error);
    return res.status(500).json({ message: "Unable to access attachment." });
  }
};
