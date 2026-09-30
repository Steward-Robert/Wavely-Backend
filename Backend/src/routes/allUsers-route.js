import { Router } from "express";
import allUser from "../controller/user.js";
import { authentification } from "../middleware/auth-middleware.js";

const allUsers = Router();

allUsers.get("/users", authentification, allUser);

export default allUsers;
