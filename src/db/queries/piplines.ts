import { eq } from "drizzle-orm";
import { db } from "../connect";
import { NewPipeline, Pipeline, pipelines } from "../schema";

export const getAllPiplines = async () => await db.select().from(pipelines);

export const getPipelineById = async (
  id: string
): Promise<Pipeline | undefined> => {
  const rows = await db.select().from(pipelines).where(eq(pipelines.id, id));
  return rows[0];
};


export const getPipelineBySourceKey = async (
  sourceKey: string
): Promise<Pipeline | undefined> => {
  const rows = await db.select().from(pipelines).where(eq(pipelines.sourceKey, sourceKey));
  return rows[0];
};
export const createPipline = async ({
  name,
  actionType,
  actionConfig,
}: NewPipeline) =>
  await db
    .insert(pipelines)
    .values({ name, actionType, actionConfig, sourceKey: crypto.randomUUID() })
    .returning();

export const updatePipeline = async (
  id: string,
  updates: Partial<Omit<Pipeline, "id" | "createdAt" | "sourceKey">>
): Promise<Pipeline | undefined> => {
  const rows = await db
    .update(pipelines)
    .set(updates)
    .where(eq(pipelines.id, id))
    .returning();
  return rows[0];
};

export const deletePipeline = async (id: string): Promise<boolean> => {
  const result = await db
    .delete(pipelines)
    .where(eq(pipelines.id, id))
    .returning();
  return result.length > 0;
};


