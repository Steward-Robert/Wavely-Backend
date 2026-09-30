import { prisma } from "../db.js";
import supabase from "./spabse.js";
import { randomUUID } from "node:crypto";

const validTargetTypes = ["PLATFORM", "USER", "POST", "COMMENT"];

const createReport = async (req, res) => {
  const attachmentPath = req.file
    ? `Reports/${randomUUID()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    : null;

  try {
    const type = String(req.body.type || "").trim();
    const reason = String(req.body.reason || "").trim();
    const targetType = req.body.targetType || "PLATFORM";
    const targetId = req.body.targetId || null;

    if (!type || type.length > 80 || !reason || reason.length > 4000) {
      return res
        .status(400)
        .json({ message: "A report type and reason are required" });
    }
    if (!validTargetTypes.includes(targetType)) {
      return res.status(400).json({ message: "Invalid report target type" });
    }
    if (targetType !== "PLATFORM" && !targetId) {
      return res
        .status(400)
        .json({ message: "A target ID is required for this report" });
    }

    if (targetId) {
      let target;
      if (targetType === "USER") {
        target = await prisma.user.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (targetId === req.user.id) {
          return res
            .status(400)
            .json({ message: "You cannot report your own account" });
        }
      } else if (targetType === "POST") {
        target = await prisma.post.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
      } else if (targetType === "COMMENT") {
        target = await prisma.comment.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
      }
      if (!target) {
        return res
          .status(404)
          .json({ message: "Reported content was not found" });
      }
    }

    let attachmentUrl;
    if (req.file && attachmentPath) {
      const { error: uploadError } = await supabase.storage
        .from("Wavely-Media")
        .upload(attachmentPath, req.file.buffer, {
          contentType: req.file.mimetype,
        });
      if (uploadError) {
        return res
          .status(500)
          .json({ message: "Unable to upload report attachment" });
      }
      attachmentUrl = supabase.storage
        .from("Wavely-Media")
        .getPublicUrl(attachmentPath).data.publicUrl;
    }

    const report = await prisma.report.create({
      data: {
        type,
        reason,
        targetType,
        targetId,
        attachmentUrl,
        reporterId: req.user.id,
      },
      select: { id: true, type: true, status: true, createdAt: true },
    });
    return res.status(201).json({ message: "Report submitted", report });
  } catch (error) {
    if (attachmentPath) {
      try {
        await supabase.storage.from("Wavely-Media").remove([attachmentPath]);
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }
    console.error(error);
    return res.status(500).json({ message: "Unable to submit report" });
  }
};

export { createReport };
