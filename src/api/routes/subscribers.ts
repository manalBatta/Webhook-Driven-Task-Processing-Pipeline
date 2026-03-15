import { Request, Response } from "express";
import express from "express";
import { NewSubscriber } from "../../db/schema";
import {
  createSubscriber,
  getAllSubscribers,
} from "../../db/qruery/subscribers";

export const subscribersRouter = express.Router({ mergeParams: true });

subscribersRouter.post("/", async (req: Request, res: Response) => {
  try {
    const targetUrl: string = req.body.targetUrl;
    const pipelineId: string = req.params.id.toString();
    const subscriber = await createSubscriber({ targetUrl, pipelineId });
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
