import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedFriendshipWhere,
  findAcceptedFriendship,
  findConversationForUser,
  getConversationPeerId,
  getConversationUserIds,
  hasActiveFriendAccess,
  toMessageResponse,
} from "./chat-access.js";

test("direct conversation ids are canonical regardless of request direction", () => {
  assert.deepEqual(getConversationUserIds("user-b", "user-a"), [
    "user-a",
    "user-b",
  ]);
  assert.deepEqual(getConversationUserIds("user-a", "user-b"), [
    "user-a",
    "user-b",
  ]);
});

test("accepted friendship lookup covers both directional record orientations", async () => {
  for (const friendship of [
    { userId: "user-a", friendId: "user-b" },
    { userId: "user-b", friendId: "user-a" },
  ]) {
    let query;
    const mockPrisma = {
      friendship: {
        findFirst: async (value) => {
          query = value;
          return friendship;
        },
      },
    };

    assert.equal(
      await findAcceptedFriendship(mockPrisma, "user-a", "user-b"),
      friendship,
    );
    assert.deepEqual(query.where, acceptedFriendshipWhere("user-a", "user-b"));
    assert.deepEqual(query.select, { id: true });
  }
});

test("self and missing-user friendship lookups never reach the database", async () => {
  const mockPrisma = {
    friendship: {
      findFirst: () => assert.fail("Friendship lookup should not run"),
    },
  };

  assert.equal(await findAcceptedFriendship(mockPrisma, "user-a", "user-a"), null);
  assert.equal(await findAcceptedFriendship(mockPrisma, null, "user-a"), null);
});

test("pending requests and inactive accounts do not authorize chat", async () => {
  let friendshipQueries = 0;
  const mockPrisma = {
    friendship: {
      findFirst: async () => {
        friendshipQueries += 1;
        return null;
      },
    },
    user: {
      findFirst: async () => ({ id: "user-b" }),
    },
    friendRequest: {
      findFirst: () => assert.fail("Friend requests must not grant chat access"),
    },
  };
  assert.equal(await hasActiveFriendAccess(mockPrisma, "user-a", "user-b"), false);
  assert.equal(friendshipQueries, 1);

  mockPrisma.friendship.findFirst = async () => ({ id: "friendship-id" });
  mockPrisma.user.findFirst = async () => null;
  assert.equal(await hasActiveFriendAccess(mockPrisma, "user-a", "user-b"), false);
});

test("conversation membership rejects unrelated users", () => {
  const conversation = { userOneId: "user-a", userTwoId: "user-b" };
  assert.equal(getConversationPeerId(conversation, "user-a"), "user-b");
  assert.equal(getConversationPeerId(conversation, "user-b"), "user-a");
  assert.equal(getConversationPeerId(conversation, "user-c"), null);
});

test("conversation lookup scopes IDs to the authenticated participant", async () => {
  let query;
  const mockPrisma = {
    conversation: {
      findFirst: async (value) => {
        query = value;
        return null;
      },
    },
  };

  await findConversationForUser(mockPrisma, "conversation-id", "user-a");
  assert.deepEqual(query.where, {
    id: "conversation-id",
    OR: [{ userOneId: "user-a" }, { userTwoId: "user-a" }],
  });
});

test("message responses expose protected media routes, not storage paths", () => {
  const response = toMessageResponse({
    id: "message-id",
    conversationId: "conversation-id",
    sender: { id: "user-a", name: "A" },
    content: null,
    createdAt: new Date("2026-10-30T00:00:00Z"),
    attachmentPath: "Messages/conversation-id/private-file",
    attachmentMimeType: "image/png",
    attachmentName: "photo.png",
  });

  assert.deepEqual(response.attachment, {
    name: "photo.png",
    mimeType: "image/png",
    mediaUrl: "/api/chat/messages/message-id/media",
  });
  assert.equal("attachmentPath" in response, false);
});
