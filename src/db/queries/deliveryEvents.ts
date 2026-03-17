import { db } from "../connect";
import { deliveryEvents, NewDeliveryEvent } from "../schema";

export const createDeliveryEvent = async (event: NewDeliveryEvent) => {
  const [row] = await db.insert(deliveryEvents).values(event).returning();
  return row;
};

