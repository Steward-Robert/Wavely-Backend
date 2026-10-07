import jwt from "jsonwebtoken";

const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.MODE_ENV === "production" ||
  process.env.MODE_DEV === "production";

const createToken = (userId, res) => {
  const payload = { id: userId };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return token;
};

export default createToken;
