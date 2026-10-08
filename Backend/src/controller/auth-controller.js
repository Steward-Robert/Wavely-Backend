import { prisma } from "../db.js";
import bcrypt from "bcrypt";
import createToken from "../utils/jwt-cookie.js";
import { deleteUserAccount } from "../utils/delete-user-account.js";

const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.MODE_ENV === "production" ||
  process.env.MODE_DEV === "production";

const registerUser = async (req, res) => {
  try {
    const { email, name, password } = req.body;
    const user = await prisma.User.findUnique({
      where: { email },
    });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });
    await createToken(newUser.id, res);
    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "This account is deactivated." });
    }
    await createToken(user.id, res);
    res.json({
      message: "Login successful",
      data: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const logout = async (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0),
    secure: isProduction,
    sameSite: isProduction ? "none" : "strict",
    path: "/",
  });
  res.status(200).json({ message: "Logged out succesfully", status: "succes" });
};

const deleteAccount = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, role: true, isActive: true },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "ADMIN" && user.isActive) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (activeAdmins <= 1) {
        return res.status(400).json({
          message: "The last active admin account cannot be deleted.",
        });
      }
    }

    await deleteUserAccount(user.id);
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message || "Unable to delete account",
    });
  }
};

export { registerUser, loginUser, logout, deleteAccount };
