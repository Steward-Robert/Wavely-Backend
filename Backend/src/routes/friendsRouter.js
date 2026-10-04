import { Router } from "express";

import {
  allFriend,
  cancelSentRequest,
  sendRequest,
  acceptRequest,
  getSentRequests,
  getReceivedRequests,
} from "../controller/sentRequest.js";

import { authentification } from "../middleware/auth-middleware.js";

const friendRouter = Router();

friendRouter.post("/sendRequest/:receiverId", authentification, sendRequest);

friendRouter.get("/allFriend", authentification, allFriend);

friendRouter.get("/sentRequests", authentification, getSentRequests);

friendRouter.get("/receivedRequests", authentification, getReceivedRequests);

friendRouter.post("/accept/:requestId", authentification, acceptRequest);

friendRouter.delete("/refuse/:receiverId", authentification, cancelSentRequest);

export default friendRouter;
