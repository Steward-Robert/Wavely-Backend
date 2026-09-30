import { Router } from "express";
import { createReport } from "../controller/report-controller.js";
import { authentification } from "../middleware/auth-middleware.js";
import { reportAttachment } from "../controller/multer.js";

const reportRouter = Router();

reportRouter.post("/", authentification, reportAttachment, createReport);

export default reportRouter;
