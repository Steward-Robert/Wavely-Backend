import { Router } from "express";
import { authentification } from "../middleware/auth-middleware.js";
import { allStories, deleteStory, uploadStory } from "../controller/story.js";
import { uploadMany } from "../controller/multer.js";

const storyRouter = Router();

storyRouter.post("/", authentification, uploadMany, uploadStory);
storyRouter.get("/", authentification, allStories);
storyRouter.delete("/:storyId", authentification, deleteStory);

export default storyRouter;
