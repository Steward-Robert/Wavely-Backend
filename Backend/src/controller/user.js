import { prisma } from "../db.js";

const allUser = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
      },
      select: {
        id: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,

        _count: {
          select: {
            likes: true,
            posts: true,
          },
        },
      },
    });

    return res.status(200).json({
      users: users.map(({ avatar, ...user }) => ({
        ...user,
        avatars: avatar ? [avatar] : [],
      })),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Unable to fetch users",
    });
  }
};

export default allUser;
