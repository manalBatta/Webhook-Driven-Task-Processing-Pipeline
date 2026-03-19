"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateJobProcessedPayload = exports.setJobStatus = exports.getAtsJobsByCandidateScore = exports.getJobs = exports.getJobById = exports.scheduleJob = exports.claimPendingJobs = exports.createJob = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const connect_1 = require("../connect");
const schema_1 = require("../schema");
const createJob = async (job) => {
    const [row] = await connect_1.db.insert(schema_1.jobs).values(job).returning();
    return row;
};
exports.createJob = createJob;
// Map raw snake_case row from SQL to our Job (camelCase) type
const mapRowToJob = (row) => ({
    id: row.id,
    pipelineId: row.pipeline_id,
    rawPayload: row.raw_payload,
    processedPayload: row.processed_payload,
    status: row.status,
    retries: row.retries,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const claimPendingJobs = async (limit = 5) => {
    const result = await connect_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE jobs
    SET status = 'processing', updated_at = NOW()
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND (next_run_at IS NULL OR next_run_at <= NOW())
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id, pipeline_id, raw_payload, processed_payload, status, retries, next_run_at, created_at, updated_at;
  `);
    const rows = result.rows ?? [];
    return rows.map(mapRowToJob);
};
exports.claimPendingJobs = claimPendingJobs;
const scheduleJob = async (jobId, nextRunAt) => {
    await connect_1.db
        .update(schema_1.jobs)
        .set({ status: "pending", nextRunAt, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.jobs.id, jobId));
};
exports.scheduleJob = scheduleJob;
const getJobById = async (id) => {
    const rows = await connect_1.db.select().from(schema_1.jobs).where((0, drizzle_orm_1.eq)(schema_1.jobs.id, id));
    return rows[0];
};
exports.getJobById = getJobById;
const getJobs = async (filters) => {
    const limit = filters?.limit ?? 50;
    const conditions = [];
    if (filters?.pipelineId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.jobs.pipelineId, filters.pipelineId));
    if (filters?.status)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.jobs.status, filters.status));
    const whereClause = conditions.length === 0
        ? undefined
        : conditions.length === 1
            ? conditions[0]
            : (0, drizzle_orm_1.and)(...conditions);
    const query = connect_1.db
        .select()
        .from(schema_1.jobs)
        .orderBy((0, drizzle_orm_1.asc)(schema_1.jobs.createdAt))
        .limit(limit);
    return whereClause ? query.where(whereClause) : query;
};
exports.getJobs = getJobs;
const getAtsJobsByCandidateScore = async (filters) => {
    const limit = filters.limit ?? 50;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.pipelines.actionType, "SMART_ATS_SCREENER")];
    if (filters.pipelineId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.jobs.pipelineId, filters.pipelineId));
    if (filters.status)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.jobs.status, filters.status));
    if (typeof filters.minCandidateScore === "number")
        conditions.push((0, drizzle_orm_1.gte)(schema_1.candidates.aiScore, filters.minCandidateScore));
    if (typeof filters.maxCandidateScore === "number")
        conditions.push((0, drizzle_orm_1.lte)(schema_1.candidates.aiScore, filters.maxCandidateScore));
    return connect_1.db
        .select({
        id: schema_1.jobs.id,
        pipelineId: schema_1.jobs.pipelineId,
        rawPayload: schema_1.jobs.rawPayload,
        processedPayload: schema_1.jobs.processedPayload,
        status: schema_1.jobs.status,
        retries: schema_1.jobs.retries,
        nextRunAt: schema_1.jobs.nextRunAt,
        createdAt: schema_1.jobs.createdAt,
        updatedAt: schema_1.jobs.updatedAt,
        candidateScore: schema_1.candidates.aiScore,
        candidateStatus: schema_1.candidates.status,
        candidateEmail: schema_1.candidates.email,
        candidateName: schema_1.candidates.name,
    })
        .from(schema_1.jobs)
        .innerJoin(schema_1.pipelines, (0, drizzle_orm_1.eq)(schema_1.jobs.pipelineId, schema_1.pipelines.id))
        .innerJoin(schema_1.candidates, (0, drizzle_orm_1.eq)(schema_1.candidates.jobId, schema_1.jobs.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.jobs.createdAt))
        .limit(limit);
};
exports.getAtsJobsByCandidateScore = getAtsJobsByCandidateScore;
const setJobStatus = async (jobId, status) => {
    await connect_1.db
        .update(schema_1.jobs)
        .set({ status, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.jobs.id, jobId));
};
exports.setJobStatus = setJobStatus;
const updateJobProcessedPayload = async (jobId, processedPayload) => {
    await connect_1.db
        .update(schema_1.jobs)
        .set({ processedPayload, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.jobs.id, jobId));
};
exports.updateJobProcessedPayload = updateJobProcessedPayload;
