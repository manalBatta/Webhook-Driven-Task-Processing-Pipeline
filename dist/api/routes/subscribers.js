"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribersRouter = void 0;
const express_1 = __importDefault(require("express"));
const subscribers_1 = require("../../db/queries/subscribers");
exports.subscribersRouter = express_1.default.Router({ mergeParams: true }); //mergePrams is neccary to see the Router path params {id}
exports.subscribersRouter.post("/", async (req, res) => {
    try {
        const targetUrl = req.body.targetUrl;
        const pipelineId = req.params.id.toString();
        const subscriber = await (0, subscribers_1.createSubscriber)({ targetUrl, pipelineId });
        if (!subscriber) {
            res.status(404).send("Couldn't Create Subscriber");
        }
        else
            res.status(201).send(subscriber);
    }
    catch (error) {
        res.status(500).send("Internal server error" + error);
    }
});
exports.subscribersRouter.get("/", async (req, res) => {
    try {
        console.log(req.params);
        const pipelineId = req.params.id.toString();
        const subscribers = await (0, subscribers_1.getAllSubscribers)(pipelineId);
        if (subscribers?.length == 0) {
            res.status(404).send("No subscribers Exist or Pipline id is wrong");
        }
        else
            res.status(200).send(subscribers);
    }
    catch (error) {
        res.status(500).send("Internal server error" + error);
    }
});
