"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryEvents = exports.candidates = exports.deliveryAttempts = exports.jobs = exports.subscribers = exports.pipelines = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.pipelines = (0, pg_core_1.pgTable)("pipelines", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)("name").notNull(),
    sourceKey: (0, pg_core_1.text)("source_key").notNull().unique(),
    actionType: (0, pg_core_1.text)("action_type").notNull(),
    actionConfig: (0, pg_core_1.jsonb)("action_config")
        .$type()
        .default(null),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.subscribers = (0, pg_core_1.pgTable)("subscribers", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    pipelineId: (0, pg_core_1.uuid)("pipeline_id")
        .notNull()
        .references(() => exports.pipelines.id, { onDelete: "cascade" }),
    targetUrl: (0, pg_core_1.text)("target_url").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.jobs = (0, pg_core_1.pgTable)("jobs", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    pipelineId: (0, pg_core_1.uuid)("pipeline_id")
        .notNull()
        .references(() => exports.pipelines.id, { onDelete: "cascade" }),
    rawPayload: (0, pg_core_1.jsonb)("raw_payload").$type().notNull(),
    processedPayload: (0, pg_core_1.jsonb)("processed_payload")
        .$type()
        .default(null),
    status: (0, pg_core_1.text)("status").notNull(), // pending | processing | completed | failed
    retries: (0, pg_core_1.integer)("retries").notNull().default(0),
    nextRunAt: (0, pg_core_1.timestamp)("next_run_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
});
exports.deliveryAttempts = (0, pg_core_1.pgTable)("delivery_attempts", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    jobId: (0, pg_core_1.uuid)("job_id")
        .notNull()
        .references(() => exports.jobs.id, { onDelete: "cascade" }),
    subscriberId: (0, pg_core_1.uuid)("subscriber_id")
        .notNull()
        .references(() => exports.subscribers.id, { onDelete: "cascade" }),
    attemptNumber: (0, pg_core_1.integer)("attempt_number").notNull(),
    statusCode: (0, pg_core_1.integer)("status_code"),
    success: (0, pg_core_1.boolean)("success").notNull(),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.candidates = (0, pg_core_1.pgTable)("candidates", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    pipelineId: (0, pg_core_1.uuid)("pipeline_id")
        .notNull()
        .references(() => exports.pipelines.id, { onDelete: "cascade" }),
    jobId: (0, pg_core_1.uuid)("job_id")
        .notNull()
        .references(() => exports.jobs.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.text)("name").notNull(),
    email: (0, pg_core_1.text)("email").notNull(),
    resumeSummary: (0, pg_core_1.text)("resume_summary"),
    aiScore: (0, pg_core_1.integer)("ai_score").notNull(),
    status: (0, pg_core_1.text)("status").notNull(), // screened | invited | rejected
    metadata: (0, pg_core_1.jsonb)("metadata").$type().default(null),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
// For non-subscriber deliveries (e.g., email invitations)
exports.deliveryEvents = (0, pg_core_1.pgTable)("delivery_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    jobId: (0, pg_core_1.uuid)("job_id")
        .notNull()
        .references(() => exports.jobs.id, { onDelete: "cascade" }),
    pipelineId: (0, pg_core_1.uuid)("pipeline_id")
        .notNull()
        .references(() => exports.pipelines.id, { onDelete: "cascade" }),
    channel: (0, pg_core_1.text)("channel").notNull(), // email | other
    target: (0, pg_core_1.text)("target").notNull(), // email address or URL
    attemptNumber: (0, pg_core_1.integer)("attempt_number").notNull(),
    statusCode: (0, pg_core_1.integer)("status_code"),
    success: (0, pg_core_1.boolean)("success").notNull(),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
