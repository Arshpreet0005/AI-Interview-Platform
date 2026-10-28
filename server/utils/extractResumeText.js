const { PDFParse } = require("pdf-parse");

const extractResumeText = async (buffer) => {
    if (!buffer || buffer.length === 0) {
        throw new Error("Resume file is empty.");
    }

    const header = buffer.slice(0, 5).toString("ascii");

    if (header !== "%PDF-") {
        throw new Error("Uploaded file is not a valid PDF resume.");
    }

    let parser;

    try {
        parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        const text = (result?.text || "").replace(/\s+/g, " ").trim();

        if (!text) {
            throw new Error("No text could be extracted from the uploaded PDF.");
        }

        return text;
    } catch (error) {
        const message = error?.message || "Unknown PDF parse error";
        console.error("Resume extraction failed:", message);
        throw new Error("The uploaded resume could not be processed. Please upload a readable PDF.");
    } finally {
        if (parser && typeof parser.destroy === "function") {
            try {
                await parser.destroy();
            } catch (cleanupError) {
                console.error("Resume parser cleanup failed:", cleanupError.message);
            }
        }
    }
};

module.exports = {
    extractResumeText,
};
