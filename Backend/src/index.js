import express from "express";
import cors from "cors";
import "dotenv/config";
import cookieParser from "cookie-parser";

import route from "./routes/auth-route.js";
import CommentRouter from "./routes/comment-route.js";
import postRouter from "./routes/post-route.js";
import storyRouter from "./routes/story-route.js";
import likeRouter from "./routes/like-route.js";
import router from "./routes/uploadAvatar.js";
import infoRouter from "./routes/Info.route.js";
import allUsers from "./routes/allUsers-route.js";
import adminRouter from "./routes/admin-route.js";
import reportRouter from "./routes/report-route.js";
import SavedRoute from "./routes/savedRoute.js";
import friendRouter from "./routes/friendsRouter.js";

const app = express();
const allowedOrigins = new Set([
  "https://wavely-bnob.onrender.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.use("/api", friendRouter);
app.use("/api/savedPost", SavedRoute);
app.use("/api/auth", route);
app.use("/api/post", postRouter);
app.use("/api/story", storyRouter);
app.use("/api/admin", adminRouter);
app.use("/api/reports", reportRouter);
app.use("/api/comment", CommentRouter);
app.use("/api/like", likeRouter);
app.use("/api", router);
app.use("/api", infoRouter);
app.use("/api", allUsers);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
