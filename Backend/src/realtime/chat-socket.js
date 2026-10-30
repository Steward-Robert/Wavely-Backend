import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { prisma } from "../db.js";

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
  } = {},
) => {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    const token = getJwtCookie(socket.handshake.headers.cookie);
    if (!token || !jwtSecret) {
      return next(new Error("Unauthorized"));
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      return next(new Error("Unauthorized"));
    }
    if (typeof payload !== "object" || typeof payload.id !== "string") {
      return next(new Error("Unauthorized"));
    }

    try {
      const user = await findActiveUser(payload.id);
      if (!user?.isActive) return next(new Error("Unauthorized"));
      socket.data.userId = user.id;
      socket.data.tokenExpiresAt =
        typeof payload.exp === "number" ? payload.exp * 1000 : null;
      return next();
    } catch (error) {
      console.error("Socket authentication lookup failed:", error);
      return next(new Error("Authentication unavailable"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
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
