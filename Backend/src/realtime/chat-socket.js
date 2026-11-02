import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { prisma } from "../db.js";
import {
  findConversationForUser,
  getConversationPeerId,
  hasActiveFriendAccess,
} from "../utils/chat-access.js";

const CHAT_SOCKET_TOKEN_AUDIENCE = "wavely-chat-socket";

const acknowledge = (callback, response) => {
  if (typeof callback === "function") callback(response);
};

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
        select: { id: true, isActive: true },
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
  } = {},
) => {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });

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

    socket.on("chat:leave", (payload, callback) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId !== "string" || !conversationId) {
        acknowledge(callback, {
          ok: false,
          message: "Conversation not found.",
        });
        return;
      }

      void socket.leave(`conversation:${conversationId}`);
      acknowledge(callback, { ok: true });
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
