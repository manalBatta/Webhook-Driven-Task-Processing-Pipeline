"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllSubscribers = exports.createSubscriber = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const connect_1 = require("../connect");
const schema_1 = require("../schema");
const createSubscriber = async (subscriber) => {
    const [result] = await connect_1.db.insert(schema_1.subscribers).values(subscriber).returning();
    return result;
};
exports.createSubscriber = createSubscriber;
const getAllSubscribers = async (pipelineId) => {
    const result = await connect_1.db
        .select()
        .from(schema_1.subscribers)
        .where((0, drizzle_orm_1.eq)(schema_1.subscribers.pipelineId, pipelineId));
    return result;
};
exports.getAllSubscribers = getAllSubscribers;
