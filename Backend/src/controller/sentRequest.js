import { prisma } from "../db.js";

const sendRequest = async (req, res) => {
  try {
    const senderId = req.user.id;
    const receiverId = req.params.receiverId;

    const user = await prisma.user.findUnique({
      where: { id: senderId },
    });

    const otherUser = await prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!user) {
      return res.status(404).json({
        message: "You're not connected",
      });
    }

    if (!otherUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (senderId === receiverId) {
      return res.status(403).json({
        message: "You cant send a send an friend request to yourself",
      });
    }
    const isFriend = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          {
            senderId: senderId,
            receiverId: receiverId,
          },
          {
            senderId: receiverId,
            receiverId: senderId,
          },
        ],
      },
    });

    if (isFriend) {
      return res.status(400).json({
        message: "A friend request already exists between you",
      });
    }

    const friend = await prisma.friendRequest.create({
      data: {
        senderId,
        receiverId,
      },
    });

    return res.status(201).json({
      message: "Friend request send succesfully",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal error",
    });
  }
};

const cancelSentRequest = async (req, res) => {
  const senderId = req.user.id;
  const receiverId = req.params.receiverId;

  try {
    await prisma.friendRequest.delete({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId,
        },
      },
    });

    res.status(200).json({
      message: "Your request has been canceled succesfully",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal error",
    });
  }
};

const acceptRequest = async (req, res) => {
  try {
    const receiverId = req.user.id;

    const { requestId } = req.params;

    const request = await prisma.friendRequest.findUnique({
      where: {
        id: requestId,
      },
    });

    if (!request) {
      return res.status(404).json({
        message: "Request not found",
      });
    }

    if (request.receiverId !== receiverId) {
      return res.status(404).json({
        message: "Request not found",
      });
    }

    const isFriend = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: request.senderId, friendId: request.receiverId },
          { friendId: request.senderId, userId: receiverId },
        ],
      },
    });

    if (isFriend) {
      return res.status(400).json({
        message: "You're already friend with each other",
      });
    }

    await prisma.friendship.create({
      data: {
        userId: receiverId,
        friendId: request.senderId,
      },
    });

    await prisma.friendRequest.delete({
      where: {
        senderId_receiverId: {
          senderId: request.senderId,
          receiverId,
        },
      },
    });

    return res.status(201).json({
      message: "You're now friends",
    });

    if (request.friendstatus !== "PENDING") {
      return res.status(400).json({
        message: "This request is no longer pending",
      });
    }
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal error",
    });
  }
};

const allFriend = async (req, res) => {
  try {
    const userId = req.user.id;
    const allF = await prisma.friendship.findMany({
      where: {
        OR: [{ friendId: userId }, { userId }],
      },

      include: {
        user: true,
        friend: true,
      },
    });

    const friends = allF.map((friendship) => {
      if (friendship.userId === userId) {
        return friendship.friend;
      }

      return friendship.user;
    });

    return res.status(200).json({
      friends,
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal error",
    });
  }
};

const getSentRequests = async (req, res) => {
  try {
    const sentRequests = await prisma.friendRequest.findMany({
      where: {
        senderId: req.user.id,
        status: "PENDING",
      },
      include: {
        receiver: {
          select: {
            id: true,
            name: true,
            avatar: {
              select: { avatar: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ sentRequests });
  } catch (error) {
    console.error("Error fetching sent friend requests:", error);
    return res.status(500).json({
      message: "Unable to fetch sent friend requests",
    });
  }
};

const getReceivedRequests = async (req, res) => {
  try {
    const receivedRequests = await prisma.friendRequest.findMany({
      where: {
        receiverId: req.user.id,
        status: "PENDING",
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: {
              select: { avatar: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ receivedRequests });
  } catch (error) {
    console.error("Error fetching received friend requests:", error);
    return res.status(500).json({
      message: "Unable to fetch received friend requests",
    });
  }
};

export {
  sendRequest,
  cancelSentRequest,
  acceptRequest,
  allFriend,
  getSentRequests,
  getReceivedRequests,
};
