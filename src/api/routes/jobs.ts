import { Request, Response } from "express";
import express from "express";
import { getPipelineBySourceKey } from "../../db/queries/piplines";
import { NewJob } from "../../db/schema";
import { createJob } from "../../db/queries/jobs";

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
