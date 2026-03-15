import { eq, asc } from "drizzle-orm";
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
