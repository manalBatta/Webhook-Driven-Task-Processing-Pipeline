"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.atsWebhookSchema = void 0;
exports.runSmartAtsScreener = runSmartAtsScreener;
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("zod");
const connect_1 = require("../../db/connect");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
exports.atsWebhookSchema = zod_1.z.object({
    resume_text: zod_1.z.string().min(1),
    candidate_info: zod_1.z.object({
        name: zod_1.z.string().min(1),
        email: zod_1.z.string().email(),
    }),
});
const atsAiOutputSchema = zod_1.z.object({
    suitability_score: zod_1.z.number().min(0).max(100),
    decision: zod_1.z.enum(["PASS", "FAIL"]),
    reasoning: zod_1.z.string().min(1),
    resume_summary: zod_1.z.string().min(1).optional(),
});
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function getOpenAIClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
    }
    return new openai_1.default({ apiKey });
}
async function callOpenAiWithRetry(args) {
    const client = getOpenAIClient();
    const maxAttempts = 3;
    const prompt = [
        "You are an ATS screener. You will evaluate a candidate resume against job requirements.",
        "Return ONLY valid JSON (no markdown, no code fences) with keys:",
        '{"suitability_score":0-100,"decision":"PASS|FAIL","reasoning":"...","resume_summary":"..."}',
        "",
        `Job requirements: ${JSON.stringify(args.jobRequirements)}`,
        `Candidate name: ${args.candidateName}`,
        `Candidate email: ${args.candidateEmail}`,
        `Resume text:\n${args.resumeText}`,
    ].join("\n");
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await Promise.race([
                client.responses.create({
                    model: args.model,
                    input: prompt,
                }),
                (async () => {
                    await sleep(args.timeoutMs);
                    throw new Error("OpenAI timeout");
                })(),
            ]);
            // The node SDK returns a structured response; safest is to extract text.
            const text = result.output_text;
            if (!text)
                throw new Error("OpenAI response had no output_text");
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                throw new Error(`OpenAI returned non-JSON: ${text.slice(0, 200)}`);
            }
            return atsAiOutputSchema.parse(parsed);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const isRateLimit = message.includes("429") ||
                message.toLowerCase().includes("rate limit") ||
                err?.status === 429;
            const isRetryable = isRateLimit ||
                message.toLowerCase().includes("timeout") ||
                err?.status >= 500;
            if (attempt === maxAttempts || !isRetryable) {
                throw err;
            }
            // Backoff: 1s, 2s, 4s
            await sleep(1000 * 2 ** (attempt - 1));
        }
    }
    throw new Error("Unreachable OpenAI retry loop");
}
async function sendAssessmentInvitationEmail(args) {
    // Placeholder: integrate SendGrid/Postmark later.
    // Simulate success.
    void args;
    return { success: true };
}
async function logEmailAttempt(args) {
    await connect_1.db.insert(schema_1.deliveryEvents).values({
        pipelineId: args.pipelineId,
        jobId: args.jobId,
        channel: "email",
        target: args.targetEmail,
        attemptNumber: args.attemptNumber,
        statusCode: args.statusCode ?? null,
        success: args.success,
        errorMessage: args.errorMessage ?? null,
    });
}
async function runSmartAtsScreener(args) {
    const parsed = exports.atsWebhookSchema.safeParse(args.rawPayload);
    if (!parsed.success) {
        const processedPayload = {
            ats: {
                error: "INVALID_PAYLOAD",
                issues: parsed.error.issues,
            },
        };
        await connect_1.db.update(schema_1.jobs).set({ processedPayload }).where((0, drizzle_orm_1.eq)(schema_1.jobs.id, args.jobId));
        return {
            processedPayload,
            shouldDeliverToSubscribers: false,
            finalJobStatusIfNoDelivery: "failed",
        };
    }
    const jobRequirements = args.actionConfig?.job_requirements ?? args.actionConfig ?? {};
    const ai = await callOpenAiWithRetry({
        model: "o4-mini",
        resumeText: parsed.data.resume_text,
        candidateName: parsed.data.candidate_info.name,
        candidateEmail: parsed.data.candidate_info.email,
        jobRequirements,
        timeoutMs: 15000,
    });
    const processedPayload = {
        ats: ai,
        candidate: parsed.data.candidate_info,
    };
    if (ai.decision === "FAIL") {
        // Persist rejection in job history and stop deliveries for this job.
        await connect_1.db.transaction(async (tx) => {
            await tx.update(schema_1.jobs).set({ processedPayload }).where((0, drizzle_orm_1.eq)(schema_1.jobs.id, args.jobId));
        });
        return {
            processedPayload,
            shouldDeliverToSubscribers: false,
            finalJobStatusIfNoDelivery: "completed",
        };
    }
    // PASS branch: persist candidate + processed payload atomically
    await connect_1.db.transaction(async (tx) => {
        await tx.update(schema_1.jobs).set({ processedPayload }).where((0, drizzle_orm_1.eq)(schema_1.jobs.id, args.jobId));
        await tx.insert(schema_1.candidates).values({
            pipelineId: args.pipelineId,
            jobId: args.jobId,
            name: parsed.data.candidate_info.name,
            email: parsed.data.candidate_info.email,
            resumeSummary: ai.resume_summary ?? null,
            aiScore: Math.round(ai.suitability_score),
            status: "screened",
            metadata: null,
        });
    });
    // Email invitation (logged as delivery_events)
    const emailResult = await sendAssessmentInvitationEmail({
        toEmail: parsed.data.candidate_info.email,
        toName: parsed.data.candidate_info.name,
        pipelineId: args.pipelineId,
        jobId: args.jobId,
    });
    await logEmailAttempt({
        pipelineId: args.pipelineId,
        jobId: args.jobId,
        targetEmail: parsed.data.candidate_info.email,
        attemptNumber: 1,
        success: emailResult.success,
        statusCode: null,
        errorMessage: emailResult.success ? null : emailResult.errorMessage ?? "EMAIL_FAILED",
    });
    if (!emailResult.success) {
        return {
            processedPayload,
            shouldDeliverToSubscribers: false,
            finalJobStatusIfNoDelivery: "failed",
        };
    }
    // Mark invited (optional, but helps demonstrate branching persistence)
    await connect_1.db
        .update(schema_1.candidates)
        .set({ status: "invited" })
        .where((0, drizzle_orm_1.eq)(schema_1.candidates.jobId, args.jobId));
    return {
        processedPayload,
        shouldDeliverToSubscribers: true,
        finalJobStatusIfNoDelivery: "completed",
    };
}
