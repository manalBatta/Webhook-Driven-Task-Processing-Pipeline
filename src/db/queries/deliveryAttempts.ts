import { db } from "../connect";
import { deliveryAttempts, NewDeliveryAttempt } from "../schema";

export const createDeliveryAttempt = async (attempt: NewDeliveryAttempt) =>
  db.insert(deliveryAttempts).values(attempt);
