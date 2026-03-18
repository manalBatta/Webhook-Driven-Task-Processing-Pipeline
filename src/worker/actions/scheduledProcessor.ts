import { z } from "zod";
import { scheduleJob, updateJobProcessedPayload } from "../../db/queries/jobs";

const scheduledConfigSchema = z.object({
  delaySeconds: z.number().min(0),
});

export async function runScheduledProcessor(args: {
  jobId: string;
  rawPayload: unknown;
  processedPayload: unknown | null;
  actionConfig: Record<string, unknown> | null;
  alreadyScheduled: boolean;
}): Promise<
  | {
      kind: "scheduled";
      processedPayload: unknown;
    }
  | {
      kind: "deliver_now";
      processedPayload: unknown;
    }
  | {
      kind: "error";
      processedPayload: unknown;
    }
> {
  // If the job is already scheduled and due (claim query enforces due),
  // we simply deliver the stored processed payload.
  if (args.alreadyScheduled) {
    return {
      kind: "deliver_now",
      processedPayload: args.processedPayload ?? args.rawPayload,
    };
  }

  const parsed = scheduledConfigSchema.safeParse(args.actionConfig ?? {});
  if (!parsed.success) {
    return {
      kind: "error",
      processedPayload: {
        error: "INVALID_SCHEDULE_CONFIG",
        issues: parsed.error.issues,
      },
    };
  }

  const delaySeconds = parsed.data.delaySeconds;
  const releaseAt = new Date(Date.now() + delaySeconds * 1000);

  // Copy rawPayload -> processedPayload once, then delay delivery.
  await updateJobProcessedPayload(args.jobId, args.rawPayload);
  await scheduleJob(args.jobId, releaseAt);

  return { kind: "scheduled", processedPayload: args.rawPayload };
}

