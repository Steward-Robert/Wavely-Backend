import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";
import { io as createClient } from "socket.io-client";
import { createChatSocketServer } from "./chat-socket.js";

const connectClient = (url, token) =>
  new Promise((resolve) => {
    const client = createClient(url, {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
      extraHeaders: token ? { Cookie: `jwt=${token}` } : {},
    });
    client.once("connect", () => resolve({ client }));
    client.once("connect_error", (error) =>
      resolve({ client, error: error.message }),
    );
    client.connect();
  });

test("Socket.IO authenticates only active users with the JWT cookie", async (t) => {
  const httpServer = createServer();
  const jwtSecret = "chat-test-secret";
  const activeUsers = new Set(["user-a", "user-b"]);
  const io = createChatSocketServer(httpServer, ["http://localhost:5173"], {
    jwtSecret,
    findActiveUser: async (id) =>
      activeUsers.has(id) ? { id, isActive: true } : null,
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

  const tokenA = jwt.sign({ id: "user-a" }, jwtSecret);
  const tokenB = jwt.sign({ id: "user-b" }, jwtSecret);
  const clientAResult = await connectClient(url, tokenA);
  const clientBResult = await connectClient(url, tokenB);
  clients.push(clientAResult.client, clientBResult.client);
  assert.equal(clientAResult.error, undefined);
  assert.equal(clientBResult.error, undefined);

  const delivered = new Promise((resolve) =>
    clientBResult.client.once("chat:test", resolve),
  );
  io.to("user:user-b").emit("chat:test", { private: true });
  assert.deepEqual(await delivered, { private: true });
});
