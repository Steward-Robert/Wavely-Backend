import { Router } from "express";
import { authentification } from "../middleware/auth-middleware.js";
import {
  post,
  deletePost,
  updatePost,
  allPost,
} from "../controller/post-controller.js";
import { uploadPostMedia } from "../controller/multer.js";

const postRouter = Router();

postRouter.post("/", authentification, uploadPostMedia, post);
postRouter.delete("/:postId", authentification, deletePost);
postRouter.put("/:postId", authentification, updatePost);
postRouter.get("/", authentification, allPost);

export default postRouter;
