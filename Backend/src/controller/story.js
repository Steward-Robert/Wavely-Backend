import supabase from "./spabse.js";
import { prisma } from "../db.js";
import { randomUUID } from "node:crypto";
import { findVisibleStories, findVisibleStory } from "../utils/story-access.js";
import {
  ensurePrivateStoryBucket,
  getStoryStorageLocation,
  getStoryStorageReference,
  PRIVATE_STORY_BUCKET,
} from "../utils/story-storage.js";

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

const getStoryResponse = (story) => {
  const { image, ...storyData } = story;
  const storageLocation = getStoryStorageLocation(image);
  const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(storageLocation?.path ?? "");

  return {
    ...storyData,
    mediaType: storageLocation ? (isVideo ? "video" : "image") : null,
    mediaUrl: storageLocation
      ? `/api/story/${encodeURIComponent(story.id)}/media`
      : null,
  };
};

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
    await ensurePrivateStoryBucket(supabase.storage);
    for (const file of files) {
      const fileName = `${randomUUID()}-${file.originalname}`;
      const imagePath = `Stories/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from(PRIVATE_STORY_BUCKET)
        .upload(imagePath, file.buffer, {
          contentType: file.mimetype,
        });

      if (uploadError) {
        return res.status(500).json({
          message: "Error uploading file",
          error: uploadError.message,
        });
      }

      const createdAt = new Date();
      const story = await prisma.story.create({
        data: {
          content,
          image: getStoryStorageReference(imagePath),
          authorId: id,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + STORY_LIFETIME_MS),
        },
      });
      uploadedStories.push(story);
    }

    return res.status(201).json({
      message: "Stories uploaded successfully",
      stories: uploadedStories.map(getStoryResponse),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "An error occurred while uploading stories",
      error: error.message,
    });
  }
};

const allStories = async (req, res) => {
  try {
    const stories = await findVisibleStories(prisma, req.user.id);

    return res.status(200).json({ stories: stories.map(getStoryResponse) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getStory = async (req, res) => {
  try {
    const story = await findVisibleStory(prisma, req.params.storyId, req.user.id);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    return res.status(200).json({ story: getStoryResponse(story) });
  } catch (error) {
    console.error("Error fetching story:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getStoryMedia = async (req, res) => {
  try {
    const story = await findVisibleStory(prisma, req.params.storyId, req.user.id);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    const storageLocation = getStoryStorageLocation(story.image);
    if (!storageLocation) {
      return res.status(404).json({ message: "Story media not found" });
    }

    const { data, error } = await supabase.storage
      .from(storageLocation.bucket)
      .download(storageLocation.path);
    if (error || !data) {
      if (error?.statusCode === "404" || error?.statusCode === 404) {
        return res.status(404).json({ message: "Story media not found" });
      }
      console.error("Error downloading story media:", error);
      return res.status(500).json({ message: "Could not load story media" });
    }

    const media = Buffer.from(await data.arrayBuffer());
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Content-Length": String(media.length),
      "Content-Type": data.type || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).send(media);
  } catch (error) {
    console.error("Error fetching story media:", error);
    return res.status(500).json({ message: "Could not load story media" });
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
      const storageLocation = getStoryStorageLocation(story.image);
      if (storageLocation) {
        const { error } = await supabase.storage
          .from(storageLocation.bucket)
          .remove([storageLocation.path]);
        if (error) console.error(error);
      }
    }

    return res.status(200).json({ message: "Story deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
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

export {
  uploadStory,
  allStories,
  getStory,
  getStoryMedia,
  deleteStory,
  cleanupExpiredStories,
};
