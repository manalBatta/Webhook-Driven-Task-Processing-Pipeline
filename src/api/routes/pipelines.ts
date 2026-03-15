import {
  createPipline,
  getAllPiplines,
  getPipelineById,
} from "../../db/qruery/piplines";
import { Request, Response } from "express";
import { CreatePipelineInput } from "../../shared/types";
import express from "express";
import { NewPipeline, Pipeline } from "../../db/schema";

export const pipelinesRouter = express.Router();
pipelinesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body: NewPipeline = req.body;
    console.log("body", body);
    const pipline = await createPipline(body);
    console.log("pipline", pipline);
    res.status(201).send(pipline);
  } catch (error) {
    res.status(500).send("Internal server error" + error);
  }
});

pipelinesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const pipelines:Pipeline[] = await getAllPiplines();
    console.log("pipelines result", pipelines);
    res.status(200).send(pipelines);
  } catch (error) {
    res.status(500).send("Internal server error" + error);
  }
});

pipelinesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id.toString();
    const pipeline = await getPipelineById(id);
    if (!pipeline) {
      res.status(404).json({ error: "Pipeline not found" });
      return;
    }
    res.status(200).send(pipeline);
  } catch (error) {
    res.status(500).send("Internal server error" + error);
  }
});
