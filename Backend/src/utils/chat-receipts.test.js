import assert from "node:assert/strict";
import test from "node:test";
import {
  markConversationRead,
  markMessageDelivered,
} from "./chat-receipts.js";

test("delivery receipts only mark an incoming message in its conversation", async () => {
  let lookup;
  let update;
  const prisma = {
    message: {
      findFirst: async (query) => {
        lookup = query;
        return {
          senderId: "user-a",
          deliveredAt: null,
          readAt: null,
        };
      },
      updateMany: async (query) => {
        update = query;
        return { count: 1 };
      },
    },
  };

  const status = await markMessageDelivered(prisma, {
    messageId: "message-a",
    conversationId: "conversation-a",
    userId: "user-b",
  });
  assert.deepEqual(lookup.where, {
    id: "message-a",
    conversationId: "conversation-a",
    senderId: { not: "user-b" },
  });
  assert.deepEqual(update.where, {
    id: "message-a",
    conversationId: "conversation-a",
    senderId: "user-a",
    deliveredAt: null,
  });
  assert.equal(status.senderId, "user-a");
  assert.deepEqual(status.messageIds, ["message-a"]);
  assert.ok(status.deliveredAt instanceof Date);
});

test("read receipts update only requested unread messages sent by the peer", async () => {
  let conversationQuery;
  let messageQuery;
  const updates = [];
  const prisma = {
    conversation: {
      findFirst: async (query) => {
        conversationQuery = query;
        return { userOneId: "user-a", userTwoId: "user-b" };
      },
    },
    message: {
      findMany: async (query) => {
        messageQuery = query;
        return [{ id: "message-a" }];
      },
      updateMany: async (query) => {
        updates.push(query);
        return { count: 1 };
      },
    },
  };

  const status = await markConversationRead(prisma, {
    conversationId: "conversation-a",
    userId: "user-b",
    messageIds: ["message-a", "message-a", "message-b"],
  });
  assert.deepEqual(conversationQuery.where, {
    id: "conversation-a",
    OR: [{ userOneId: "user-b" }, { userTwoId: "user-b" }],
  });
  assert.deepEqual(messageQuery.where, {
    id: { in: ["message-a", "message-b"] },
    conversationId: "conversation-a",
    senderId: "user-a",
    readAt: null,
  });
  assert.deepEqual(updates.map((update) => update.where), [
    { id: { in: ["message-a"] }, deliveredAt: null },
    { id: { in: ["message-a"] }, readAt: null },
  ]);
  assert.equal(status.senderId, "user-a");
  assert.deepEqual(status.messageIds, ["message-a"]);
  assert.equal(status.deliveredAt, status.readAt);
});

test("read receipts do not update a conversation for a nonparticipant", async () => {
  const prisma = {
    conversation: {
      findFirst: async () => null,
    },
    message: {
      findMany: () => assert.fail("Messages must not be queried"),
      updateMany: () => assert.fail("Messages must not be updated"),
    },
  };

  assert.equal(
    await markConversationRead(prisma, {
      conversationId: "conversation-a",
      userId: "user-c",
      messageIds: ["message-a"],
    }),
    null,
  );
});
