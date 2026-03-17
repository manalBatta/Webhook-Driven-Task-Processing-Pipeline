import { eq } from "drizzle-orm";
import { db } from "../connect";
import { candidates, NewCandidate } from "../schema";

export const createCandidate = async (candidate: NewCandidate) => {
  const [row] = await db.insert(candidates).values(candidate).returning();
  return row;
};

export const getCandidateByJobId = async (jobId: string) => {
  const rows = await db.select().from(candidates).where(eq(candidates.jobId, jobId));
  return rows[0];
};

