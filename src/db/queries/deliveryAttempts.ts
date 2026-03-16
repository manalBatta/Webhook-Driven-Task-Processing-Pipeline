import { eq, asc } from "drizzle-orm";
import { db } from "../connect";
import { deliveryAttempts, NewDeliveryAttempt, subscribers } from "../schema";

export const createDeliveryAttempt = async (attempt: NewDeliveryAttempt) =>
  db.insert(deliveryAttempts).values(attempt);

export const getDeliveryAttemptsByJobId = async (jobId: string) =>
  db
    .select({
      id: deliveryAttempts.id,
      jobId: deliveryAttempts.jobId,
      subscriberId: deliveryAttempts.subscriberId,
      targetUrl: subscribers.targetUrl,
      attemptNumber: deliveryAttempts.attemptNumber,
      statusCode: deliveryAttempts.statusCode,
      success: deliveryAttempts.success,
      errorMessage: deliveryAttempts.errorMessage,
      createdAt: deliveryAttempts.createdAt,
    })
    .from(deliveryAttempts)
    .innerJoin(subscribers, eq(deliveryAttempts.subscriberId, subscribers.id))
    .where(eq(deliveryAttempts.jobId, jobId))
    .orderBy(asc(deliveryAttempts.attemptNumber));
