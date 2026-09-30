import { prisma } from "../db.js";

const withAvatarList = (user) => {
  if (!user) return user;

  const { avatar, ...userData } = user;
  return {
    ...userData,
    avatars: avatar ? [avatar] : [],
  };
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            likes: true,
            posts: true,
          },
        },
      },
    });
    return res.status(200).json({ user: withAvatarList(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "server error" });
  }
};

const getUserInfo = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,

        posts: {
          orderBy: {
            createdAt: "desc",
          },
        },

        _count: {
          select: {
            likes: true,
            posts: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user: withAvatarList(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "server error" });
  }
};

export { getMe, getUserInfo };
