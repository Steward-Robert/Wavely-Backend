import { Router } from "express";
import { authentification } from "../middleware/auth-middleware.js";
import {
  allChatFriends,
  allConversations,
  conversationMessages,
  createConversation,
  getMessageMedia,
  requireConversationAccess,
  sendMessage,
  uploadMessageAttachment,
} from "../controller/chat-controller.js";

const chatRouter = Router();

chatRouter.use(authentification);
chatRouter.get("/friends", allChatFriends);
chatRouter.get("/conversations", allConversations);
chatRouter.post("/conversations", createConversation);
chatRouter.get(
  "/conversations/:conversationId/messages",
  requireConversationAccess,
  conversationMessages,
);
chatRouter.post(
  "/conversations/:conversationId/messages",
  requireConversationAccess,
  uploadMessageAttachment,
  sendMessage,
);
chatRouter.get("/messages/:messageId/media", getMessageMedia);

export default chatRouter;
