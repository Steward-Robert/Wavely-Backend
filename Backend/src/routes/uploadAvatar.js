import express from "express";
import upload from "../controller/multer.js";

import uploadAvatar from "../controller/uploadAvatar.js";
import { authentification } from "../middleware/auth-middleware.js";

const router = express.Router();

router.post("/upload", authentification, upload.single("image"), uploadAvatar);

export default router;
