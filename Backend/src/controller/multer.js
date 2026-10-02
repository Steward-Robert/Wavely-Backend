import multer from "multer";
const upload = multer({
  storage: multer.memoryStorage(),
});

export const uploadMany = (req, res, next) => {
  upload.array("image", 9)(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message:
          error.code === "LIMIT_UNEXPECTED_FILE"
            ? "You can upload up to 9 files"
            : error.message,
      });
    }
    next();
  });
};

export const uploadPostMedia = (req, res, next) => {
  upload.fields([
    { name: "image", maxCount: 9 },
    { name: "video", maxCount: 9 },
  ])(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message:
          error.code === "LIMIT_UNEXPECTED_FILE"
            ? "Invalid media field or too many files"
            : error.message,
      });
    }
    next();
  });
};

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname),
      );
    }
    callback(null, true);
  },
});

export const reportAttachment = (req, res, next) => {
  reportUpload.single("attachment")(req, res, (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Attachments must be 5 MB or smaller"
          : "Attachments must be PNG, JPG, or PDF files";
      return res.status(400).json({ message });
    }
    next();
  });
};

export default upload;
