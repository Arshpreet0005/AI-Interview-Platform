const mongoose = require("mongoose");

const dayPlanSchema = new mongoose.Schema(
    {
        day: {
            type: Number,
            required: true,
        },
        topic: {
            type: String,
            required: true,
        },
        objective: {
            type: String,
            required: true,
        },
        activity: {
            type: String,
            required: true,
        },
        estimatedTime: {
            type: String,
            required: true,
        },
        expectedOutcome: {
            type: String,
            required: true,
        },
        completed: {
            type: Boolean,
            default: false,
        },
    },
    {
        _id: false,
    }
);

const improvementPlanSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        summary: {
            type: String,
            default: "",
        },
        focusAreas: [
            {
                type: String,
            },
        ],
        days: [dayPlanSchema],
        generatedFromInterviewIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Interview",
            },
        ],
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("ImprovementPlan", improvementPlanSchema);
