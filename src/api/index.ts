import express from "express";
import "dotenv/config";
import { db } from "../db/connect";
import { pipelinesRouter } from "./routes/pipelines";
import { subscribersRouter } from "./routes/subscribers";
import { jobsRouter } from "./routes/jobs";

export const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use("/pipelines", pipelinesRouter);
app.use("/pipelines/:id/subscribers", subscribersRouter);
app.use(jobsRouter);
app.listen(8080, () => {
  console.log(`API server listening on port ${port}`);
});
