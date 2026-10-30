import supabase from "./spabse.js";
import { prisma } from "../db.js";
import { randomUUID } from "node:crypto";

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

const uploadStory = async (req, res) => {
  try {
    const files = req.files;
    const id = req.user?.id;
    const { content } = req.body;

    if (!id) {
      return res.status(401).json({ message: "You need to be connected" });
    }
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Add a file to continue" });
    }
    if (files.length > 9) {
      return res.status(400).json({ message: "You can upload up to 9 files" });
    }

    const uploadedStories = [];
    for (const file of files) {
      const fileName = `${randomUUID()}-${file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("Wavely-Media")
        .upload(`Stories/${fileName}`, file.buffer, {
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
        .getPublicUrl(`Stories/${fileName}`);
      const createdAt = new Date();
      const story = await prisma.story.create({
        data: {
          content,
          image: publicData.publicUrl,
          authorId: id,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + STORY_LIFETIME_MS),
        },
      });
      uploadedStories.push(story);
    }

    return res.status(201).json({
      message: "Stories uploaded successfully",
      stories: uploadedStories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "An error occurred while uploading stories",
      error: error.message,
    });
  }
};

const allStories = async (_req, res) => {
  try {
    const stories = await prisma.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ stories });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const deleteStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "You need to be connected" });
    }

    const story = await prisma.story.findFirst({
      where: {
        id: storyId,
        expiresAt: { gt: new Date() },
      },
    });
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }
    if (story.authorId !== userId) {
      return res.status(403).json({ message: "You cannot delete this story" });
    }

    await prisma.story.delete({ where: { id: storyId } });

    if (story.image) {
      const imagePath = getStoragePath(story.image, "Stories");
      if (imagePath) {
        const { error } = await supabase.storage
          .from("Wavely-Media")
          .remove([imagePath]);
        if (error) console.error(error);
      }
    }

    return res.status(200).json({ message: "Story deleted successfully" });
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

const cleanupExpiredStories = async () => {
  const { count } = await prisma.story.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  if (count > 0) {
    console.info(`Removed ${count} expired stories`);
  }

  return count;
};

export { uploadStory, allStories, deleteStory, cleanupExpiredStories };
