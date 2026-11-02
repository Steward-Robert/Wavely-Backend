import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";
import { io as createClient } from "socket.io-client";
import { createChatSocketServer } from "./chat-socket.js";

const connectClient = (url, token, useAuthPayload = false) =>
  new Promise((resolve) => {
    const options = {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
    };
    if (token && useAuthPayload) {
      options.auth = { token };
    } else if (token) {
      options.extraHeaders = { Cookie: `jwt=${token}` };
    }
    const client = createClient(url, options);
    client.once("connect", () => resolve({ client }));
    client.once("connect_error", (error) =>
      resolve({ client, error: error.message }),
    );
    client.connect();
  });

test("Socket.IO authenticates only active users with the JWT cookie", async (t) => {
  const httpServer = createServer();
  const jwtSecret = "chat-test-secret";
  const activeUsers = new Set(["user-a", "user-b", "user-c"]);
  const io = createChatSocketServer(httpServer, ["http://localhost:5173"], {
    jwtSecret,
    findActiveUser: async (id) =>
      activeUsers.has(id) ? { id, isActive: true } : null,
    canJoinConversation: async (conversationId, userId) =>
      conversationId === "conversation-a" &&
      ["user-a", "user-b"].includes(userId),
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];

  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    await new Promise((resolve) => io.close(resolve));
  });

  const noToken = await connectClient(url);
  clients.push(noToken.client);
  assert.equal(noToken.error, "Unauthorized");

  const inactiveToken = jwt.sign({ id: "inactive-user" }, jwtSecret);
  const inactive = await connectClient(url, inactiveToken);
  clients.push(inactive.client);
  assert.equal(inactive.error, "Unauthorized");

  const expiredToken = jwt.sign(
    { id: "user-a" },
    jwtSecret,
    { expiresIn: -1 },
  );
  const expired = await connectClient(url, expiredToken);
  clients.push(expired.client);
  assert.equal(expired.error, "Unauthorized");

  const expiredSocketTicket = jwt.sign(
    {
      id: "user-a",
      purpose: "chat-socket",
      sessionExp: Math.floor(Date.now() / 1000) + 3600,
    },
    jwtSecret,
    {
      audience: "wavely-chat-socket",
      expiresIn: -1,
    },
  );
  const expiredTicket = await connectClient(
    url,
    expiredSocketTicket,
    true,
  );
  clients.push(expiredTicket.client);
  assert.equal(expiredTicket.error, "Unauthorized");

  const tokenA = jwt.sign({ id: "user-a" }, jwtSecret);
  const tokenB = jwt.sign({ id: "user-b" }, jwtSecret);
  const tokenC = jwt.sign({ id: "user-c" }, jwtSecret);
  const clientAResult = await connectClient(url, tokenA);
  const clientBResult = await connectClient(url, tokenB);
  const clientCResult = await connectClient(url, tokenC);
  clients.push(
    clientAResult.client,
    clientBResult.client,
    clientCResult.client,
  );
  assert.equal(clientAResult.error, undefined);
  assert.equal(clientBResult.error, undefined);
  assert.equal(clientCResult.error, undefined);

  const socketTicket = jwt.sign(
    {
      id: "user-a",
      purpose: "chat-socket",
      sessionExp: Math.floor(Date.now() / 1000) + 3600,
    },
    jwtSecret,
    {
      audience: "wavely-chat-socket",
      expiresIn: "60s",
    },
  );
  const ticketClient = await connectClient(url, socketTicket, true);
  clients.push(ticketClient.client);
  assert.equal(ticketClient.error, undefined);

  const joinConversation = (client, conversationId) =>
    new Promise((resolve) => {
      client.emit("chat:join", { conversationId }, resolve);
    });
  assert.deepEqual(
    await joinConversation(clientBResult.client, "conversation-a"),
    { ok: true },
  );
  assert.deepEqual(
    await joinConversation(clientCResult.client, "conversation-a"),
    { ok: false, message: "Conversation not found." },
  );
  const roomMembers = await io
    .in("conversation:conversation-a")
    .fetchSockets();
  assert.deepEqual(
    roomMembers.map((socket) => socket.data.userId),
    ["user-b"],
  );

  const delivered = new Promise((resolve) =>
    clientBResult.client.once("chat:message", resolve),
  );
  io.to("conversation:conversation-a").emit("chat:message", {
    conversationId: "conversation-a",
    content: "private",
  });
  assert.deepEqual(await delivered, {
    conversationId: "conversation-a",
    content: "private",
  });
});
