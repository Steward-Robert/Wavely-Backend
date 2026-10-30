import { Router } from "express";
import { authentification } from "../middleware/auth-middleware.js";
import {
  allStories,
  deleteStory,
  getStory,
  getStoryMedia,
  uploadStory,
} from "../controller/story.js";
import { uploadMany } from "../controller/multer.js";

const storyRouter = Router();

storyRouter.post("/", authentification, uploadMany, uploadStory);
storyRouter.get("/", authentification, allStories);
storyRouter.get("/:storyId/media", authentification, getStoryMedia);
storyRouter.get("/:storyId", authentification, getStory);
storyRouter.delete("/:storyId", authentification, deleteStory);

export default storyRouter;
