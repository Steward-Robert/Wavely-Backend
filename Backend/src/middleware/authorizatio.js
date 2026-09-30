import { prisma } from "../db.js";

export const requireAdmin = async (req, res, next) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (user.role !== "ADMIN") {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    req.user = { ...req.user, role: user.role };
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const authorization = requireAdmin;
