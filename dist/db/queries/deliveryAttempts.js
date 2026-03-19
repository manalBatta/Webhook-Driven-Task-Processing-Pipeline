"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeliveryAttemptsByJobId = exports.createDeliveryAttempt = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const connect_1 = require("../connect");
const schema_1 = require("../schema");
const createDeliveryAttempt = async (attempt) => connect_1.db.insert(schema_1.deliveryAttempts).values(attempt);
exports.createDeliveryAttempt = createDeliveryAttempt;
const getDeliveryAttemptsByJobId = async (jobId) => connect_1.db
    .select({
    id: schema_1.deliveryAttempts.id,
    jobId: schema_1.deliveryAttempts.jobId,
    subscriberId: schema_1.deliveryAttempts.subscriberId,
    targetUrl: schema_1.subscribers.targetUrl,
    candidateEmail: schema_1.candidates.email,
    attemptNumber: schema_1.deliveryAttempts.attemptNumber,
    statusCode: schema_1.deliveryAttempts.statusCode,
    success: schema_1.deliveryAttempts.success,
    errorMessage: schema_1.deliveryAttempts.errorMessage,
    createdAt: schema_1.deliveryAttempts.createdAt,
})
    .from(schema_1.deliveryAttempts)
    .innerJoin(schema_1.subscribers, (0, drizzle_orm_1.eq)(schema_1.deliveryAttempts.subscriberId, schema_1.subscribers.id))
    .leftJoin(schema_1.candidates, (0, drizzle_orm_1.eq)(schema_1.deliveryAttempts.jobId, schema_1.candidates.jobId))
    .where((0, drizzle_orm_1.eq)(schema_1.deliveryAttempts.jobId, jobId))
    .orderBy((0, drizzle_orm_1.asc)(schema_1.deliveryAttempts.attemptNumber));
exports.getDeliveryAttemptsByJobId = getDeliveryAttemptsByJobId;
