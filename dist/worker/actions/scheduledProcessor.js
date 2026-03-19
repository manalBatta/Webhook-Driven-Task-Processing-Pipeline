"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScheduledProcessor = runScheduledProcessor;
const zod_1 = require("zod");
const jobs_1 = require("../../db/queries/jobs");
const scheduledConfigSchema = zod_1.z.object({
    delaySeconds: zod_1.z.number().min(0),
});
async function runScheduledProcessor(args) {
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
    await (0, jobs_1.updateJobProcessedPayload)(args.jobId, args.rawPayload);
    await (0, jobs_1.scheduleJob)(args.jobId, releaseAt);
    return { kind: "scheduled", processedPayload: args.rawPayload };
}
