import { eq, asc, and } from "drizzle-orm";
import { db } from "../connect";
import { jobs, NewJob } from "../schema";

export const createJob = async (
  job: NewJob
): Promise<(typeof jobs.$inferSelect) | undefined> => {
  const [row] = await db.insert(jobs).values(job).returning();
  return row;
};

export const getPendingJobs = async (limit = 5) => {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "pending"))
    .orderBy(asc(jobs.createdAt))
    .limit(limit);
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
  if (filters?.pipelineId) conditions.push(eq(jobs.pipelineId, filters.pipelineId));
  if (filters?.status) conditions.push(eq(jobs.status, filters.status));
  const whereClause =
    conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
  const query = db
    .select()
    .from(jobs)
    .orderBy(asc(jobs.createdAt))
    .limit(limit);
  return whereClause ? query.where(whereClause) : query;
};

export const setJobStatus = async (
  jobId: string,
  status: string
): Promise<void> => {
  await db.update(jobs).set({ status, updatedAt: new Date() }).where(eq(jobs.id, jobId));
};

export const updateJobProcessedPayload = async (
  jobId: string,
  processedPayload: unknown
): Promise<void> => {
  await db
    .update(jobs)
    .set({ processedPayload, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
};
