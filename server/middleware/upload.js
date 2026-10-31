const multer = require("multer");

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (!file) {
        return cb(new Error("No file uploaded."), false);
    }

    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
        return cb(null, true);
    }

    return cb(new Error("Only PDF files are allowed."), false);
};

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
});

module.exports = {
    upload,
    MAX_FILE_SIZE,
};
