import express from "express";
import { uploadAvatarFile } from "../controller/multer.js";

import uploadAvatar from "../controller/uploadAvatar.js";
import { authentification } from "../middleware/auth-middleware.js";

const router = express.Router();

router.post("/upload", authentification, uploadAvatarFile, uploadAvatar);

export default router;
