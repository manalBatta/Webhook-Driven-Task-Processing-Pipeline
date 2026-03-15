import { Request, Response } from "express";
import express from "express";
import { NewSubscriber } from "../../db/schema";
import {
  createSubscriber,
  getAllSubscribers,
} from "../../db/queries/subscribers";
import { getPipelineBySourceKey } from "../../db/queries/piplines";

export const subscribersRouter = express.Router({ mergeParams: true }); //mergePrams is neccary to see the Router path params {id}

subscribersRouter.post("/", async (req: Request, res: Response) => {
  try {
    const targetUrl: string = req.body.targetUrl;
    const pipelineSourceKey: string = req.params.id.toString();
    const pipeline = await getPipelineBySourceKey(pipelineSourceKey);
    if (!pipeline) {
      res.status(404).send("Couldn't Create Subscriber");
      return;
    }
    const subscriber = await createSubscriber({
      targetUrl,
      pipelineId: pipeline.id,
    });
    if (!subscriber) {
      res.status(404).send("Couldn't Create Subscriber");
    } else res.status(201).send(subscriber);
  } catch (error) {
    res.status(500).send("Internal server error" + error);
  }
});

subscribersRouter.get("/", async (req: Request, res: Response) => {
  try {
    console.log(req.params);

    const pipelineId: string = req.params.id.toString();

    const subscribers = await getAllSubscribers(pipelineId);
    if (subscribers?.length == 0) {
      res.status(404).send("No subscribers Exist or Pipline id is wrong");
    } else res.status(200).send(subscribers);
  } catch (error) {
    res.status(500).send("Internal server error" + error);
  }
});
