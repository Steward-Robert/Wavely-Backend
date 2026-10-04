import { Router } from "express";

import {
  savePost,
  deleteSavedPost,
  getSavedPosts,
} from "../controller/savePost.js";

import { authentification } from "../middleware/auth-middleware.js";

const SavedRoute = Router();

SavedRoute.post("/:postId", authentification, savePost);
SavedRoute.delete("/:postId", authentification, deleteSavedPost);
SavedRoute.get("/saved", authentification, getSavedPosts);

export default SavedRoute;
