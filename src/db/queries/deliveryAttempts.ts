import { eq, asc } from "drizzle-orm";
import { db } from "../connect";
import { candidates, deliveryAttempts, NewDeliveryAttempt, subscribers } from "../schema";

export const createDeliveryAttempt = async (attempt: NewDeliveryAttempt) =>
  db.insert(deliveryAttempts).values(attempt);

export const getDeliveryAttemptsByJobId = async (jobId: string) =>
  db
    .select({
      id: deliveryAttempts.id,
      jobId: deliveryAttempts.jobId,
      subscriberId: deliveryAttempts.subscriberId,
      targetUrl: subscribers.targetUrl,
      candidateEmail: candidates.email,
      attemptNumber: deliveryAttempts.attemptNumber,
      statusCode: deliveryAttempts.statusCode,
      success: deliveryAttempts.success,
      errorMessage: deliveryAttempts.errorMessage,
      createdAt: deliveryAttempts.createdAt,
    })
    .from(deliveryAttempts)
    .innerJoin(subscribers, eq(deliveryAttempts.subscriberId, subscribers.id))
    .leftJoin(candidates, eq(deliveryAttempts.jobId, candidates.jobId))
    .where(eq(deliveryAttempts.jobId, jobId))
    .orderBy(asc(deliveryAttempts.attemptNumber));
