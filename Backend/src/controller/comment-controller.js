import { prisma } from "../db.js";

const commentAuthorSelect = {
  id: true,
  name: true,
  avatar: {
    select: { avatar: true },
  },
};

const commentaire = async (req, res) => {
  try {
    const { content } = req.body;
    const { postId } = req.params;
    const { id } = req.user;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "there is no content to submit" });
    }
    if (!id) {
      return res
        .status(400)
        .json({ message: "you need to be connected to submit a comment" });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId: postId,
        authorId: id,
      },
      include: {
        author: { select: commentAuthorSelect },
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const comment = await prisma.comment.findUnique({
      where: { id: id },
    });

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.authorId !== userId) {
      return res.status(403).json({ message: "Acces denied" });
    }

    await prisma.comment.delete({
      where: { id: id },
    });

    return res.status(200).json({ message: "Your comment is now deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateCommentaire = async (req, res) => {
  try {
    const { content } = req.body;
    const userId = req.user.id;
    const { id } = req.params;

    const comment = await prisma.comment.findUnique({
      where: { id: id },
    });

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.authorId !== userId) {
      return res.status(403).json({ message: "Acces denied" });
    }

    const newPost = await prisma.comment.update({
      where: { id: id },
      data: {
        content,
      },
      include: {
        author: { select: commentAuthorSelect },
      },
    });

    res.status(200).json({
      status: "Succes",
      data: {
        newPost,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const allComment = async (req, res) => {
  try {
    const allComm = await prisma.comment.findMany({
      include: {
        author: { select: commentAuthorSelect },
      },
    });
    res.status(200).json({
      status: "Succes",
      allComm,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export { commentaire, deleteComment, updateCommentaire, allComment };
