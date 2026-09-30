import { Router } from "express";
import { getMe, getUserInfo } from "../controller/userInfo.js";
import { authentification } from "../middleware/auth-middleware.js";

const infoRouter = Router();

infoRouter.get("/me", authentification, getMe);
infoRouter.get("/userInfo/:id", authentification, getUserInfo);

export default infoRouter;
