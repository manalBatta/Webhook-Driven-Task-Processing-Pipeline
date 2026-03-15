import { eq } from "drizzle-orm";
import { db } from "../connect";
import { NewSubscriber, Subscriber, subscribers } from "../schema";

export const createSubscriber = async (
  subscriber: NewSubscriber,
): Promise<Subscriber | undefined> => {
  const [result] = await db.insert(subscribers).values(subscriber).returning();
  return result;
};

export const getAllSubscribers = async (
  pipelineId: string,
): Promise<Subscriber[] | undefined> => {
  const result = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.pipelineId, pipelineId));
  return result;
};
