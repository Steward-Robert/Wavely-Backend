import { prisma } from "../db.js";

const savePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = req.params.postId;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    const saved = await prisma.saved.create({
      data: {
        userID: userId,
        postID: postId,
      },
    });

    return res.status(201).json({
      message: "Post saved successfully",
      saved,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

const deleteSavedPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = req.params.postId;

    const saved = await prisma.saved.findUnique({
      where: {
        postID_userID: {
          postID: postId,
          userID: userId,
        },
      },
    });

    if (!saved) {
      return res.status(404).json({
        message: "This post is not in your saved posts",
      });
    }

    await prisma.saved.delete({
      where: {
        postID_userID: {
          postID: postId,
          userID: userId,
        },
      },
    });

    return res.status(200).json({
      message: "Post removed from your saved posts",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

const getSavedPosts = async (req, res) => {
  try {
    const allSavedPosts = await prisma.saved.findMany({
      where: {
        userID: req.user.id,
      },
      include: {
        post: {
          include: {
            author: true,
            comments: true,
            likes: true,
          },
        },
      },
      orderBy: {
        createAt: "desc",
      },
    });

    return res.status(200).json({
      savedPosts: allSavedPosts,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export { savePost, deleteSavedPost, getSavedPosts };
