import { randomUUID } from "node:crypto";
import supabase from "./spabse.js";
import { prisma } from "../db.js";

const uploadAvatar = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({
        message: "Add a file to continue",
      });
    }

    if (!userId) {
      return res.status(401).json({
        message: "You need to be connected",
      });
    }

    const filePath = `Avatars/${userId}/${randomUUID()}`;

    const [previousAvatarResult, uploadResult] = await Promise.allSettled([
      prisma.avatar.findUnique({
        where: { ownerId: userId },
        select: { avatar: true },
      }),
      supabase.storage.from("Wavely-Media").upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      }),
    ]);

    if (uploadResult.status === "rejected") {
      throw uploadResult.reason;
    }

    if (uploadResult.value.error) {
      return res.status(500).json({
        message: uploadResult.value.error.message,
      });
    }

    if (previousAvatarResult.status === "rejected") {
      const { error: cleanupError } = await supabase.storage
        .from("Wavely-Media")
        .remove([filePath]);
      if (cleanupError) {
        console.error(
          "Failed to remove avatar after database lookup failed:",
          cleanupError,
        );
      }
      throw previousAvatarResult.reason;
    }

    const previousAvatar = previousAvatarResult.value;

    // Récupérer l'URL publique
    const { data: publicUrlData } = supabase.storage
      .from("Wavely-Media")
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    // Enregistrer l'URL dans PostgreSQL avec Prisma
    const avatarImg = await prisma.avatar.upsert({
      where: { ownerId: userId },
      update: { avatar: publicUrl },
      create: { avatar: publicUrl, ownerId: userId },
    });

    const storagePathPrefix = "/storage/v1/object/public/Wavely-Media/";
    const previousAvatarUrl = previousAvatar?.avatar;
    const prefixIndex = previousAvatarUrl?.indexOf(storagePathPrefix) ?? -1;
    const previousFilePath =
      prefixIndex === -1
        ? null
        : decodeURIComponent(
            previousAvatarUrl.slice(prefixIndex + storagePathPrefix.length),
          );

    if (previousFilePath && previousFilePath !== filePath) {
      void supabase.storage
        .from("Wavely-Media")
        .remove([previousFilePath])
        .then(({ error: cleanupError }) => {
          if (cleanupError) {
            console.error("Failed to remove previous avatar:", cleanupError);
          }
        })
        .catch((cleanupError) => {
          console.error("Failed to remove previous avatar:", cleanupError);
        });
    }

    return res.status(201).json({
      message: "File uploaded successfully",
      avatar: avatarImg,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

export default uploadAvatar;
