"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
const express_1 = __importDefault(require("express"));
const piplines_1 = require("../../db/queries/piplines");
const jobs_1 = require("../../db/queries/jobs");
const deliveryAttempts_1 = require("../../db/queries/deliveryAttempts");
exports.jobsRouter = express_1.default.Router({ mergeParams: true });
exports.jobsRouter.post("/webhooks/:sourceKey", async (req, res) => {
    try {
        const sourceKey = req.params.sourceKey.toString();
        const pipeline = await (0, piplines_1.getPipelineBySourceKey)(sourceKey);
        if (!pipeline) {
            res.status(404).send("pipeline sourceKey not found");
            return;
        }
        const body = req.body;
        const jobValues = {
            pipelineId: pipeline.id,
            rawPayload: body,
            status: "pending",
            retries: 0,
        };
        const job = await (0, jobs_1.createJob)(jobValues);
        if (!job) {
            res.status(500).json({ error: "Failed to create job" });
            return;
        }
        res.status(202).json({ id: job.id, status: job.status });
    }
    catch (error) {
        res.status(500).send("Internal server error" + error);
    }
});
exports.jobsRouter.get("/jobs", async (req, res) => {
    try {
        const pipelineId = typeof req.query.pipelineId === "string" ? req.query.pipelineId : undefined;
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const minCandidateScore = typeof req.query.minCandidateScore === "string"
            ? Number(req.query.minCandidateScore)
            : undefined;
        const maxCandidateScore = typeof req.query.maxCandidateScore === "string"
            ? Number(req.query.maxCandidateScore)
            : undefined;
        const useAtsFilter = typeof minCandidateScore === "number" ||
            typeof maxCandidateScore === "number";
        const jobs = useAtsFilter
            ? await (0, jobs_1.getAtsJobsByCandidateScore)({
                pipelineId,
                status,
                limit,
                minCandidateScore,
                maxCandidateScore,
            })
            : await (0, jobs_1.getJobs)({ pipelineId, status, limit });
        res.status(200).json(jobs);
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
exports.jobsRouter.get("/jobs/:id", async (req, res) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!id) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        const job = await (0, jobs_1.getJobById)(id);
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        const deliveryAttempts = await (0, deliveryAttempts_1.getDeliveryAttemptsByJobId)(id);
        res.status(200).json({
            ...job,
            deliveryAttempts,
        });
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
