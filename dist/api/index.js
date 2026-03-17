"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
require("dotenv/config");
const pipelines_1 = require("./routes/pipelines");
const subscribers_1 = require("./routes/subscribers");
const jobs_1 = require("./routes/jobs");
exports.app = (0, express_1.default)();
const port = process.env.PORT || 3000;
exports.app.use(express_1.default.json());
exports.app.use("/pipelines", pipelines_1.pipelinesRouter);
exports.app.use("/pipelines/:id/subscribers", subscribers_1.subscribersRouter);
exports.app.use(jobs_1.jobsRouter);
exports.app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
});
