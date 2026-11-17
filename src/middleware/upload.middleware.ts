import multer from "multer";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(new Error("Only JPEG, PNG, WebP and GIF images are allowed."));
    return;
  }
  callback(null, true);
};

export const productImageUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 11,
    fields: 20,
    parts: 31,
  },
  fileFilter,
}).fields([
  {
    name: "mainImage",
    maxCount: 1,
  },
  {
    name: "galleryImages",
    maxCount: 10,
  },
]);
