import express from "express";
import "dotenv/config";
import { db } from "../db/connect";
import { pipelinesRouter } from "./routes/pipelines";
import { subscribersRouter } from "./routes/subscribers";
import { jobsRouter } from "./routes/jobs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
export const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use("/pipelines", pipelinesRouter);
app.use("/pipelines/:id/subscribers", subscribersRouter);
app.use(jobsRouter);
async function start() {
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

start();
