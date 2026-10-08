import { Router } from "express";
import {
  registerUser,
  loginUser,
  logout,
  deleteAccount,
} from "../controller/auth-controller.js";
import { authentification } from "../middleware/auth-middleware.js";

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logout);
router.delete("/account", authentification, deleteAccount);

export default router;
