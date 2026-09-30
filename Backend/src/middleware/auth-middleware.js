import jwt from "jsonwebtoken";
import { prisma } from "../db.js";

export const authentification = async (req, res, next) => {
  try {
    const token = req.cookies?.jwt;

    if (!token) {
      return res.status(401).json({
        message: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id) {
      return res.status(401).json({ message: "Invalid token." });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, isActive: true },
    });
    if (!user) {
      return res.status(401).json({ message: "Invalid token." });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "This account is deactivated." });
    }

    req.user = { id: user.id };
    next();
  } catch (error) {
    console.error("JWT ERROR:", error);

    return res.status(401).json({
      message: "Invalid token.",
    });
  }
};
