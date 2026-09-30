import supabase from "./spabse.js";
import { prisma } from "../db.js";

const pageOptions = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(10, Number.parseInt(query.limit, 10) || 25),
  );
  return { page, limit, skip: (page - 1) * limit };
};

const getStoragePath = (publicUrl, folder) => {
  try {
    const segments = new URL(publicUrl).pathname.split("/");
    const folderIndex = segments.indexOf(folder);
    return folderIndex < 0
      ? null
      : segments.slice(folderIndex).map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
};

const adminOverview = async (_req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalPosts,
      totalComments,
      totalLikes,
      totalStories,
      totalReports,
      openReports,
      recentActivity,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.like.count(),
      prisma.story.count(),
      prisma.report.count(),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.report.findMany({
        where: { status: { not: "OPEN" } },
        include: {
          reporter: { select: { id: true, name: true } },
          handledBy: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
    ]);

    return res.status(200).json({
      stats: {
        totalUsers,
        activeUsers,
        totalPosts,
        totalComments,
        totalLikes,
        totalStories,
        totalReports,
        openReports,
      },
      recentActivity,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load admin overview" });
  }
};

const adminUsers = async (req, res) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const search = String(req.query.q || "").trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          avatar: true,
          _count: { select: { posts: true, comments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return res.status(200).json({
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load users" });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }
    if (!isActive && userId === req.user.id) {
      return res
        .status(400)
        .json({ message: "You cannot deactivate your own account" });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!isActive && targetUser.role === "ADMIN") {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (activeAdmins <= 1) {
        return res
          .status(400)
          .json({ message: "The last active admin cannot be deactivated" });
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    return res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to update account status" });
  }
};

const adminPosts = async (req, res) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const search = String(req.query.q || "").trim();
    const where = search
      ? { content: { contains: search, mode: "insensitive" } }
      : {};
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: { select: { id: true, name: true } },
          _count: { select: { comments: true, likes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);
    return res.status(200).json({
      posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load posts" });
  }
};

const deleteAdminPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { postId } }),
      prisma.like.deleteMany({ where: { postId } }),
      prisma.post.delete({ where: { id: postId } }),
    ]);

    if (post.image) {
      const imagePath = getStoragePath(post.image, "Posts");
      if (imagePath) {
        const { error } = await supabase.storage
          .from("Wavely-Media")
          .remove([imagePath]);
        if (error) console.error(error);
      }
    }

    return res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to delete post" });
  }
};

const adminComments = async (req, res) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const search = String(req.query.q || "").trim();
    const where = search
      ? { content: { contains: search, mode: "insensitive" } }
      : {};
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        include: {
          author: { select: { id: true, name: true } },
          post: { select: { id: true, content: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.comment.count({ where }),
    ]);
    return res.status(200).json({
      comments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load comments" });
  }
};

const deleteAdminComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    await prisma.comment.delete({ where: { id: commentId } });
    return res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to delete comment" });
  }
};

const adminReports = async (req, res) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const validStatuses = ["OPEN", "REVIEWED", "DISMISSED"];
    const status = validStatuses.includes(req.query.status)
      ? req.query.status
      : undefined;
    const where = status ? { status } : {};
    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          handledBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);
    return res.status(200).json({
      reports,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load reports" });
  }
};

const updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body;
    if (!["OPEN", "REVIEWED", "DISMISSED"].includes(status)) {
      return res.status(400).json({ message: "Invalid report status" });
    }

    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        handledById: status === "OPEN" ? null : req.user.id,
      },
    });
    return res.status(200).json({ report });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Report not found" });
    }
    console.error(error);
    return res.status(500).json({ message: "Unable to update report" });
  }
};

export {
  adminOverview,
  adminUsers,
  updateUserStatus,
  adminPosts,
  deleteAdminPost,
  adminComments,
  deleteAdminComment,
  adminReports,
  updateReportStatus,
};
