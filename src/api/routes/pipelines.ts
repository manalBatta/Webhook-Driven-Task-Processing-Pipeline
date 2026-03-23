import {
  createPipline,
  getAllPiplines,
  getPipelineById,
  updatePipeline,
  deletePipeline,
} from "../../db/queries/piplines";
import { Request, Response } from "express";
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
    const pipelines: Pipeline[] = await getAllPiplines();
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
    } else res.status(200).send(pipeline);
  } catch (error) {
    res.status(500).send("Internal server error" + error);
  }
});

pipelinesRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id.toString();
    const updates = req.body;

    // Validate that pipeline exists
    const existingPipeline = await getPipelineById(id);
    if (!existingPipeline) {
      res.status(404).json({ error: "Pipeline not found" });
      return;
    }

    console.log("updating pipeline", id, "with", updates);
    const updatedPipeline = await updatePipeline(id, updates);
    console.log("updated pipeline", updatedPipeline);
    res.status(200).send(updatedPipeline);
  } catch (error) {
    res.status(500).send("Internal server error: " + error);
  }
});

pipelinesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id.toString();

    // Validate that pipeline exists
    const existingPipeline = await getPipelineById(id);
    if (!existingPipeline) {
      res.status(404).json({ error: "Pipeline not found" });
      return;
    }

    console.log("deleting pipeline", id);
    const deleted = await deletePipeline(id);

    if (deleted) {
      res.status(200).json({ message: "Pipeline deleted successfully", id });
    } else {
      res.status(500).json({ error: "Failed to delete pipeline" });
    }
  } catch (error) {
    res.status(500).send("Internal server error: " + error);
  }
});
