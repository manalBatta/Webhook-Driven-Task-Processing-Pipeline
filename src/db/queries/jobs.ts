import { eq, asc, and, sql } from "drizzle-orm";
import { db } from "../connect";
import { Job, jobs, NewJob } from "../schema";

export const createJob = async (
  job: NewJob,
): Promise<typeof jobs.$inferSelect | undefined> => {
  const [row] = await db.insert(jobs).values(job).returning();
  return row;
};

// Map raw snake_case row from SQL to our Job (camelCase) type
const mapRowToJob = (row: any): Job => ({
  id: row.id,
  pipelineId: row.pipeline_id,
  rawPayload: row.raw_payload,
  processedPayload: row.processed_payload,
  status: row.status,
  nextRunAt: row.next_run_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const claimPendingJobs = async (limit = 5): Promise<Job[]> => {
  const result = await db.execute(sql`
    UPDATE jobs
    SET status = 'processing', updated_at = NOW()
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'pending'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id, pipeline_id, raw_payload, processed_payload, status, retries, next_run_at, created_at, updated_at;
  `);
  const rows = (result as any).rows ?? [];
  return rows.map(mapRowToJob);
};

export const getJobById = async (id: string) => {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id));
  return rows[0];
};

export const getJobs = async (filters?: {
  pipelineId?: string;
  status?: string;
  limit?: number;
}) => {
  const limit = filters?.limit ?? 50;
  const conditions = [];
  if (filters?.pipelineId)
    conditions.push(eq(jobs.pipelineId, filters.pipelineId));
  if (filters?.status) conditions.push(eq(jobs.status, filters.status));
  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);
  const query = db
    .select()
    .from(jobs)
    .orderBy(asc(jobs.createdAt))
    .limit(limit);
  return whereClause ? query.where(whereClause) : query;
};

export const setJobStatus = async (
  jobId: string,
  status: string,
): Promise<void> => {
  await db
    .update(jobs)
    .set({ status, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
};

export const updateJobProcessedPayload = async (
  jobId: string,
  processedPayload: unknown,
): Promise<void> => {
  await db
    .update(jobs)
    .set({ processedPayload, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
};
