import { Request, Response } from "express";
import express from "express";
import { getPipelineBySourceKey } from "../../db/queries/piplines";
import { NewJob } from "../../db/schema";
import {
  createJob,
  getJobById,
  getJobs,
} from "../../db/queries/jobs";
import { getDeliveryAttemptsByJobId } from "../../db/queries/deliveryAttempts";

export const jobsRouter = express.Router({ mergeParams: true });

jobsRouter.post("/webhooks/:sourceKey", async (req: Request, res: Response) => {
  try {
    const sourceKey: string = req.params.sourceKey.toString();
    const pipeline = await getPipelineBySourceKey(sourceKey);
    if (!pipeline) {
      res.status(404).send("pipeline sourceKey not found");
      return;
    }
    const body = req.body;
    const jobValues: NewJob = {
      pipelineId: pipeline.id,
      rawPayload: body,
      status: "pending",
      retries: 0,
    };
    const job = await createJob(jobValues);
    if (!job) {
      res.status(500).json({ error: "Failed to create job" });
      return;
    }
    res.status(202).json({ id: job.id, status: job.status });
  } catch (error) {
    res.status(500).send("Internal server error" + error);
  }
});

jobsRouter.get("/jobs", async (req: Request, res: Response) => {
  try {
    const pipelineId =
      typeof req.query.pipelineId === "string" ? req.query.pipelineId : undefined;
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const jobs = await getJobs({ pipelineId, status, limit });
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

jobsRouter.get("/jobs/:id", async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const job = await getJobById(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const deliveryAttempts = await getDeliveryAttemptsByJobId(id);
    res.status(200).json({
      ...job,
      deliveryAttempts,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});
