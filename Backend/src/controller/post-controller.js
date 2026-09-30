import supabase from "./spabse.js";
import { prisma } from "../db.js";
import { randomUUID } from "node:crypto";

const uploadPost = async (req, res) => {
  try {
    const files = req.files;
    const id = req.user?.id;
    const { content } = req.body;

    if (!id) {
      return res.status(401).json({
        message: "You need to be connected",
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        message: "Add a file to continue",
      });
    }

    if (files.length > 9) {
      return res.status(400).json({ message: "You can upload up to 9 files" });
    }

    const uploadedPosts = [];
    for (const file of files) {
      const fileName = `${randomUUID()}-${file.originalname}`;

      const { error: uploadError } = await supabase.storage
        .from("Wavely-Media")
        .upload(`Posts/${fileName}`, file.buffer, {
          contentType: file.mimetype,
        });

      if (uploadError) {
        return res.status(500).json({
          message: "Error uploading file",
          error: uploadError.message,
        });
      }

      const { data: publicData } = supabase.storage
        .from("Wavely-Media")
        .getPublicUrl(`Posts/${fileName}`);

      const post = await prisma.post.create({
        data: {
          content,
          image: publicData.publicUrl,
          authorId: id,
        },
      });
      uploadedPosts.push(post);
    }

    return res.status(201).json({
      message: "Posts uploaded successfully",
      posts: uploadedPosts,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

const allPost = async (_req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ posts });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "You need to be connected" });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    if (post.authorId !== userId) {
      return res.status(403).json({ message: "You cannot delete this post" });
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
    return res.status(500).json({ message: "Server error" });
  }
};

const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id;
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "You need to be connected" });
    }
    if (typeof content !== "string") {
      return res.status(400).json({ message: "Content is required" });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    if (post.authorId !== userId) {
      return res.status(403).json({ message: "You cannot modify this post" });
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { content },
    });

    return res.status(200).json({ post: updatedPost });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
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

export { uploadPost as post, deletePost, updatePost, allPost };
