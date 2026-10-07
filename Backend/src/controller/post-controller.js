import supabase from "./spabse.js";
import { prisma } from "../db.js";
import { randomUUID } from "node:crypto";
import { getPostStoragePaths } from "../utils/post-storage.js";

const uploadPost = async (req, res) => {
  let createdPost;
  const uploadedPaths = [];

  try {
    const files = [...(req.files?.image ?? []), ...(req.files?.video ?? [])];
    const id = req.user?.id;
    const { content } = req.body;
    const normalizedContent = typeof content === "string" ? content.trim() : "";

    if (!id) {
      return res.status(401).json({
        message: "You need to be connected",
      });
    }

    if (!normalizedContent && files.length === 0) {
      return res.status(400).json({
        message: "Add text or media to create a post",
      });
    }

    if (files.length > 9) {
      return res.status(400).json({ message: "You can upload up to 9 files" });
    }

    createdPost = await prisma.post.create({
      data: {
        content: normalizedContent || null,
        authorId: id,
        mediaType: files.length
          ? files[0].mimetype.startsWith("video/")
            ? "video"
            : "image"
          : "text",
      },
    });

    let firstMediaUrl = null;
    for (const file of files) {
      const fileName = `${randomUUID()}-${file.originalname}`;
      const storagePath = `Posts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("Wavely-Media")
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
        });

      if (uploadError) {
        throw new Error(`Error uploading file: ${uploadError.message}`);
      }
      uploadedPaths.push(storagePath);

      const { data: publicData } = supabase.storage
        .from("Wavely-Media")
        .getPublicUrl(storagePath);
      const mediaType = file.mimetype.startsWith("video/") ? "video" : "image";
      const mediaUrl = publicData.publicUrl;
      firstMediaUrl ??= mediaUrl;

      await prisma.postMedia.create({
        data: {
          url: mediaUrl,
          mediaType,
          postId: createdPost.id,
        },
      });
    }

    const post = await prisma.post.update({
      where: { id: createdPost.id },
      data: { image: firstMediaUrl },
      include: {
        media: {
          select: { id: true, url: true, mediaType: true },
        },
      },
    });

    return res.status(201).json({
      message: "Post uploaded successfully",
      posts: [post],
    });
  } catch (error) {
    console.error(error);
    if (createdPost) {
      if (uploadedPaths.length > 0) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from("Wavely-Media")
            .remove(uploadedPaths);
          if (cleanupError) throw cleanupError;
        } catch (cleanupError) {
          console.error("Could not clean up failed post upload:", cleanupError);
          return res.status(500).json({
            message: "Post upload failed and media cleanup could not complete",
          });
        }
      }

      try {
        await prisma.post.delete({ where: { id: createdPost.id } });
      } catch (cleanupError) {
        console.error("Could not remove failed post:", cleanupError);
        return res.status(500).json({
          message: "Post upload failed and the incomplete post could not be removed",
        });
      }
    }
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

const allPost = async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            avatar: {
              select: { avatar: true },
            },
          },
        },
        _count: { select: { likes: true, comments: true } },
        media: {
          select: {
            id: true,
            url: true,
            mediaType: true,
          },
        },
        likes: {
          where: { userId: req.user.id },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      posts: posts.map(({ likes, ...post }) => ({
        ...post,
        likedByUser: likes.length > 0,
      })),
    });
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

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { media: { select: { url: true } } },
    });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    if (post.authorId !== userId) {
      return res.status(403).json({ message: "You cannot delete this post" });
    }

    const storagePaths = getPostStoragePaths(post);
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("Wavely-Media")
        .remove(storagePaths);
      if (storageError) {
        console.error("Could not remove post media from storage:", storageError);
        return res.status(500).json({
          message: "Could not delete the post media. Please try again.",
        });
      }
    }

    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { postId } }),
      prisma.like.deleteMany({ where: { postId } }),
      prisma.post.delete({ where: { id: postId } }),
    ]);

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

export { uploadPost as post, deletePost, updatePost, allPost };
