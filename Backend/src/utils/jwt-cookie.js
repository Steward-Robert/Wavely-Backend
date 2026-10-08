import jwt from "jsonwebtoken";

const createToken = (userId, res) => {
  const token = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

  const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: isProduction, // Activé si sur Render / en production
    sameSite: isProduction ? "none" : "lax", // 'none' pour le cross-domain sur HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    path: "/",
  });
};

export default createToken;
