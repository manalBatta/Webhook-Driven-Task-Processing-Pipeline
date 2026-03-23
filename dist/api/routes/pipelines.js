"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipelinesRouter = void 0;
const piplines_1 = require("../../db/queries/piplines");
const express_1 = __importDefault(require("express"));
exports.pipelinesRouter = express_1.default.Router();
exports.pipelinesRouter.post("/", async (req, res) => {
    try {
        const body = req.body;
        console.log("body", body);
        const pipline = await (0, piplines_1.createPipline)(body);
        console.log("pipline", pipline);
        res.status(201).send(pipline);
    }
    catch (error) {
        res.status(500).send("Internal server error" + error);
    }
});
exports.pipelinesRouter.get("/", async (req, res) => {
    try {
        const pipelines = await (0, piplines_1.getAllPiplines)();
        console.log("pipelines result", pipelines);
        res.status(200).send(pipelines);
    }
    catch (error) {
        res.status(500).send("Internal server error" + error);
    }
});
exports.pipelinesRouter.get("/:id", async (req, res) => {
    try {
        const id = req.params.id.toString();
        const pipeline = await (0, piplines_1.getPipelineById)(id);
        if (!pipeline) {
            res.status(404).json({ error: "Pipeline not found" });
        }
        else
            res.status(200).send(pipeline);
    }
    catch (error) {
        res.status(500).send("Internal server error" + error);
    }
});
exports.pipelinesRouter.put("/:id", async (req, res) => {
    try {
        const id = req.params.id.toString();
        const updates = req.body;
        // Validate that pipeline exists
        const existingPipeline = await (0, piplines_1.getPipelineById)(id);
        if (!existingPipeline) {
            res.status(404).json({ error: "Pipeline not found" });
            return;
        }
        console.log("updating pipeline", id, "with", updates);
        const updatedPipeline = await (0, piplines_1.updatePipeline)(id, updates);
        console.log("updated pipeline", updatedPipeline);
        res.status(200).send(updatedPipeline);
    }
    catch (error) {
        res.status(500).send("Internal server error: " + error);
    }
});
exports.pipelinesRouter.delete("/:id", async (req, res) => {
    try {
        const id = req.params.id.toString();
        // Validate that pipeline exists
        const existingPipeline = await (0, piplines_1.getPipelineById)(id);
        if (!existingPipeline) {
            res.status(404).json({ error: "Pipeline not found" });
            return;
        }
        console.log("deleting pipeline", id);
        const deleted = await (0, piplines_1.deletePipeline)(id);
        if (deleted) {
            res.status(200).json({ message: "Pipeline deleted successfully", id });
        }
        else {
            res.status(500).json({ error: "Failed to delete pipeline" });
        }
    }
    catch (error) {
        res.status(500).send("Internal server error: " + error);
    }
});
