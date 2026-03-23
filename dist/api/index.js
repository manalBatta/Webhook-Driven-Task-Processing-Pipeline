"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
require("dotenv/config");
const connect_1 = require("../db/connect");
const pipelines_1 = require("./routes/pipelines");
const subscribers_1 = require("./routes/subscribers");
const jobs_1 = require("./routes/jobs");
const migrator_1 = require("drizzle-orm/node-postgres/migrator");
exports.app = (0, express_1.default)();
const port = process.env.PORT || 3000;
exports.app.use(express_1.default.json());
exports.app.use("/pipelines", pipelines_1.pipelinesRouter);
exports.app.use("/pipelines/:id/subscribers", subscribers_1.subscribersRouter);
exports.app.use(jobs_1.jobsRouter);
async function start() {
    try {
        await (0, migrator_1.migrate)(connect_1.db, { migrationsFolder: "./drizzle" });
        exports.app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    }
    catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}
start();
