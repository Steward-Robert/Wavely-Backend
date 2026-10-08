import { Router } from "express";
import {
  adminComments,
  adminOverview,
  adminPostAuthors,
  adminPosts,
  adminReports,
  adminUsers,
  deleteAdminUser,
  deleteAdminComment,
  deleteAdminPost,
  updateReportStatus,
  updateUserStatus,
} from "../controller/admin-controller.js";
import { authentification } from "../middleware/auth-middleware.js";
import { requireAdmin } from "../middleware/authorizatio.js";

const adminRouter = Router();

adminRouter.use(authentification, requireAdmin);
adminRouter.get("/overview", adminOverview);
adminRouter.get("/users", adminUsers);
adminRouter.patch("/users/:userId/status", updateUserStatus);
adminRouter.delete("/users/:userId", deleteAdminUser);
adminRouter.get("/posts/authors", adminPostAuthors);
adminRouter.get("/posts", adminPosts);
adminRouter.delete("/posts/:postId", deleteAdminPost);
adminRouter.get("/comments", adminComments);
adminRouter.delete("/comments/:commentId", deleteAdminComment);
adminRouter.get("/reports", adminReports);
adminRouter.patch("/reports/:reportId", updateReportStatus);

export default adminRouter;
