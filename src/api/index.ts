import express from "express";
import "dotenv/config";
import { db } from "../db/connect";
import { pipelinesRouter } from "./routes/pipelines";

export const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use("/pipelines", pipelinesRouter);
app.get("/health", (_req, res) => {
  try {
    console.log("Database connection successful");
    res.status(200).json({ status: db.execute("SELECT 1") });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Database connection failed" });
  }
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
