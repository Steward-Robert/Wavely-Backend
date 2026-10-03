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
    const previousAvatars = await prisma.avatar.findMany({
      where: { ownerId: userId },
      select: { avatar: true },
    });

    // Upload vers Supabase
    const { error } = await supabase.storage
      .from("Wavely-Media")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) {
      return res.status(500).json({
        message: error.message,
      });
    }

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
    const previousFilePaths = previousAvatars.flatMap(({ avatar }) => {
      const prefixIndex = avatar?.indexOf(storagePathPrefix) ?? -1;
      if (prefixIndex === -1) return [];

      const previousFilePath = decodeURIComponent(
        avatar.slice(prefixIndex + storagePathPrefix.length),
      );
      return previousFilePath === filePath ? [] : [previousFilePath];
    });

    if (previousFilePaths.length > 0) {
      const { error: cleanupError } = await supabase.storage
        .from("Wavely-Media")
        .remove(previousFilePaths);

      if (cleanupError) console.error(cleanupError);
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
