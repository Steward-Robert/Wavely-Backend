import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { prisma } from "../db.js";
import {
  findConversationForUser,
  getConversationPeerId,
  hasActiveFriendAccess,
} from "../utils/chat-access.js";
import {
  markConversationRead,
  markMessageDelivered,
} from "../utils/chat-receipts.js";

const CHAT_SOCKET_TOKEN_AUDIENCE = "wavely-chat-socket";

const acknowledge = (callback, response) => {
  if (typeof callback === "function") callback(response);
};

const isAcceptedFriend = (firstUserId, secondUserId) =>
  hasActiveFriendAccess(prisma, firstUserId, secondUserId);

const getJwtCookie = (cookieHeader) => {
  for (const cookie of (cookieHeader ?? "").split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== "jwt") continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
};

export const createChatSocketServer = (
  httpServer,
  allowedOrigins,
  {
    jwtSecret = process.env.JWT_SECRET,
    findActiveUser = (id) =>
      prisma.user.findUnique({
        where: { id },
        select: { id: true, isActive: true, name: true },
      }),
    canJoinConversation = async (conversationId, userId) => {
      const conversation = await findConversationForUser(
        prisma,
        conversationId,
        userId,
      );
      if (!conversation) return false;

      const peerId = getConversationPeerId(conversation, userId);
      return hasActiveFriendAccess(prisma, userId, peerId);
    },
    hasFriendAccess = isAcceptedFriend,
    updateLastSeen = (userId, lastSeenAt) =>
      prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt },
        select: { lastSeenAt: true },
      }),
    findLastSeen = (userId) =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { lastSeenAt: true },
      }),
    persistMessageDelivery = (data) => markMessageDelivered(prisma, data),
    persistConversationRead = (data) => markConversationRead(prisma, data),
  } = {},
) => {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });
  const activeConnections = new Map();
  const typingSockets = new Map();

  const notifyPresenceWatchers = (userId, payload) => {
    io.to(`presence:${userId}`).emit("presence:update", payload);
  };

  const clearSocketTyping = (socket, conversationId) => {
    const conversationTyping = typingSockets.get(conversationId);
    const userTyping = conversationTyping?.get(socket.data.userId);
    if (!userTyping) return;

    userTyping.delete(socket.id);
    socket.data.typingConversations?.delete(conversationId);
    if (userTyping.size > 0) return;

    conversationTyping.delete(socket.data.userId);
    if (conversationTyping.size === 0) typingSockets.delete(conversationId);
    socket.to(`conversation:${conversationId}`).emit("chat:typing", {
      conversationId,
      userId: socket.data.userId,
      name: socket.data.userName,
      isTyping: false,
    });
  };

  io.use(async (socket, next) => {
    const socketToken = socket.handshake.auth?.token;
    const token =
      typeof socketToken === "string"
        ? socketToken
        : getJwtCookie(socket.handshake.headers.cookie);
    if (!token || !jwtSecret) {
      return next(new Error("Unauthorized"));
    }

    let payload;
    try {
      payload =
        typeof socketToken === "string"
          ? jwt.verify(token, jwtSecret, {
              audience: CHAT_SOCKET_TOKEN_AUDIENCE,
            })
          : jwt.verify(token, jwtSecret);
    } catch {
      return next(new Error("Unauthorized"));
    }
    if (
      typeof payload !== "object" ||
      typeof payload.id !== "string" ||
      (typeof socketToken === "string" &&
        (payload.purpose !== "chat-socket" ||
          typeof payload.sessionExp !== "number" ||
          payload.sessionExp <= Math.floor(Date.now() / 1000)))
    ) {
      return next(new Error("Unauthorized"));
    }

    try {
      const user = await findActiveUser(payload.id);
      if (!user?.isActive) return next(new Error("Unauthorized"));
      socket.data.userId = user.id;
      socket.data.userName = user.name ?? "";
      const sessionExpiresAt =
        typeof socketToken === "string" ? payload.sessionExp : payload.exp;
      socket.data.tokenExpiresAt =
        typeof sessionExpiresAt === "number" ? sessionExpiresAt * 1000 : null;
      return next();
    } catch (error) {
      console.error("Socket authentication lookup failed:", error);
      return next(new Error("Authentication unavailable"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.data.typingConversations = new Set();
    const currentConnections =
      activeConnections.get(socket.data.userId) ?? 0;
    activeConnections.set(socket.data.userId, currentConnections + 1);
    if (currentConnections === 0) {
      notifyPresenceWatchers(socket.data.userId, {
        userId: socket.data.userId,
        isOnline: true,
        lastSeenAt: null,
      });
    }

    socket.on("presence:watch", async (payload, callback) => {
      const targetUserId = payload?.userId;
      if (typeof targetUserId !== "string") {
        acknowledge(callback, {
          ok: false,
          message: "Presence is unavailable.",
        });
        return;
      }

      try {
        if (!(await hasFriendAccess(socket.data.userId, targetUserId))) {
          acknowledge(callback, {
            ok: false,
            message: "Presence is unavailable.",
          });
          return;
        }
        const target = await findLastSeen(targetUserId);
        if (!target) {
          acknowledge(callback, {
            ok: false,
            message: "Presence is unavailable.",
          });
          return;
        }
        await socket.join(`presence:${targetUserId}`);
        acknowledge(callback, {
          ok: true,
          userId: targetUserId,
          isOnline: (activeConnections.get(targetUserId) ?? 0) > 0,
          lastSeenAt: target.lastSeenAt,
        });
      } catch (error) {
        console.error("Could not retrieve friend presence:", error);
        acknowledge(callback, {
          ok: false,
          message: "Unable to retrieve presence.",
        });
      }
    });

    socket.on("presence:unwatch", (payload) => {
      const targetUserId = payload?.userId;
      if (typeof targetUserId === "string") {
        void socket.leave(`presence:${targetUserId}`);
      }
    });

    socket.on("chat:join", async (payload, callback) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId !== "string" || !conversationId) {
        acknowledge(callback, {
          ok: false,
          message: "Conversation not found.",
        });
        return;
      }

      try {
        if (
          !(await canJoinConversation(conversationId, socket.data.userId))
        ) {
          acknowledge(callback, {
            ok: false,
            message: "Conversation not found.",
          });
          return;
        }

        await socket.join(`conversation:${conversationId}`);
        acknowledge(callback, { ok: true });
      } catch (error) {
        console.error("Could not authorize chat room access:", error);
        acknowledge(callback, {
          ok: false,
          message: "Unable to join this conversation.",
        });
      }
    });

    socket.on("chat:typing", async (payload) => {
      const conversationId = payload?.conversationId;
      if (
        typeof conversationId !== "string" ||
        !socket.rooms.has(`conversation:${conversationId}`)
      ) {
        return;
      }
      try {
        if (
          !(await canJoinConversation(conversationId, socket.data.userId))
        ) {
          await socket.leave(`conversation:${conversationId}`);
          clearSocketTyping(socket, conversationId);
          return;
        }
        if (payload.isTyping === true) {
          let conversationTyping = typingSockets.get(conversationId);
          if (!conversationTyping) {
            conversationTyping = new Map();
            typingSockets.set(conversationId, conversationTyping);
          }
          let userTyping = conversationTyping.get(socket.data.userId);
          if (!userTyping) {
            userTyping = new Set();
            conversationTyping.set(socket.data.userId, userTyping);
          }
          const wasTyping = userTyping.size > 0;
          userTyping.add(socket.id);
          socket.data.typingConversations.add(conversationId);
          if (!wasTyping) {
            socket.to(`conversation:${conversationId}`).emit("chat:typing", {
              conversationId,
              userId: socket.data.userId,
              name: socket.data.userName,
              isTyping: true,
            });
          }
        } else if (payload.isTyping === false) {
          clearSocketTyping(socket, conversationId);
        }
      } catch (error) {
        console.error("Could not process typing state:", error);
      }
    });

    socket.on("chat:delivered", async (payload, callback) => {
      const conversationId = payload?.conversationId;
      const messageId = payload?.messageId;
      if (
        typeof conversationId !== "string" ||
        typeof messageId !== "string"
      ) {
        acknowledge(callback, { ok: false });
        return;
      }
      try {
        if (
          !(await canJoinConversation(conversationId, socket.data.userId))
        ) {
          acknowledge(callback, { ok: false });
          return;
        }
        const status = await persistMessageDelivery({
          conversationId,
          messageId,
          userId: socket.data.userId,
        });
        if (status) {
          io.to(`user:${status.senderId}`).emit("chat:message-status", {
            conversationId,
            messageIds: status.messageIds,
            deliveredAt: status.deliveredAt,
            readAt: status.readAt,
          });
        }
        acknowledge(callback, { ok: Boolean(status) });
      } catch (error) {
        console.error("Could not record message delivery:", error);
        acknowledge(callback, { ok: false });
      }
    });

    socket.on("chat:read", async (payload, callback) => {
      const conversationId = payload?.conversationId;
      if (
        typeof conversationId !== "string" ||
        !socket.rooms.has(`conversation:${conversationId}`)
      ) {
        acknowledge(callback, { ok: false });
        return;
      }
      try {
        if (
          !(await canJoinConversation(conversationId, socket.data.userId))
        ) {
          acknowledge(callback, { ok: false });
          return;
        }
        const status = await persistConversationRead({
          conversationId,
          userId: socket.data.userId,
          messageIds: payload.messageIds,
        });
        if (status) {
          io.to(`user:${status.senderId}`).emit("chat:message-status", {
            conversationId,
            messageIds: status.messageIds,
            deliveredAt: status.deliveredAt,
            readAt: status.readAt,
          });
        }
        acknowledge(callback, { ok: true });
      } catch (error) {
        console.error("Could not record conversation read state:", error);
        acknowledge(callback, { ok: false });
      }
    });

    socket.on("chat:leave", (payload, callback) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId !== "string" || !conversationId) {
        acknowledge(callback, {
          ok: false,
          message: "Conversation not found.",
        });
        return;
      }

      clearSocketTyping(socket, conversationId);
      void socket.leave(`conversation:${conversationId}`);
      acknowledge(callback, { ok: true });
    });

    socket.on("disconnect", () => {
      for (const conversationId of socket.data.typingConversations) {
        clearSocketTyping(socket, conversationId);
      }
      const remainingConnections =
        (activeConnections.get(socket.data.userId) ?? 1) - 1;
      if (remainingConnections > 0) {
        activeConnections.set(socket.data.userId, remainingConnections);
        return;
      }

      activeConnections.delete(socket.data.userId);
      const lastSeenAt = new Date();
      void updateLastSeen(socket.data.userId, lastSeenAt)
        .then((result) => {
          if (activeConnections.has(socket.data.userId)) return;
          notifyPresenceWatchers(socket.data.userId, {
            userId: socket.data.userId,
            isOnline: false,
            lastSeenAt: result.lastSeenAt,
          });
        })
        .catch((error) => {
          console.error("Could not persist last-seen timestamp:", error);
          if (activeConnections.has(socket.data.userId)) return;
          notifyPresenceWatchers(socket.data.userId, {
            userId: socket.data.userId,
            isOnline: false,
            lastSeenAt: null,
          });
        });
    });

    const expiresAt = socket.data.tokenExpiresAt;
    if (expiresAt) {
      const timeout = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, expiresAt - Date.now()),
      );
      socket.once("disconnect", () => clearTimeout(timeout));
    }
  });

  return io;
};
