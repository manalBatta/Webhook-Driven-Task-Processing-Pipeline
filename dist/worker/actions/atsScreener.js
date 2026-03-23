"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSmartAtsScreener = runSmartAtsScreener;
const zod_1 = require("zod");
const connect_1 = require("../../db/connect");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const generative_ai_1 = require("@google/generative-ai");
const resend_1 = require("resend");
const resumeSubmissionSchema = zod_1.z.object({
    resume_text: zod_1.z.string().min(1),
    candidate_info: zod_1.z.object({
        name: zod_1.z.string().min(1),
        email: zod_1.z.string().email(),
    }),
});
const assessmentSubmissionSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    score: zod_1.z.number().min(0).max(100),
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
function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
    }
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
}
async function callGeminiWithRetry(args) {
    const client = getGeminiClient();
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
            const model = client.getGenerativeModel({ model: args.model });
            const result = await Promise.race([
                model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        // Encourage deterministic, structured output
                        temperature: 0.2,
                    },
                }),
                (async () => {
                    await sleep(args.timeoutMs);
                    throw new Error("Gemini timeout");
                })(),
            ]);
            const text = result?.response?.text?.();
            if (!text)
                throw new Error("Gemini response had no text");
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
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
    throw new Error("Unreachable Gemini retry loop");
}
async function sendAssessmentInvitationEmail(args) {
    try {
        const resendapikey = process.env.RESEND_API_KEY;
        if (!resendapikey) {
            throw new Error("RESEND_API_KEY is not set");
        }
        const resend = new resend_1.Resend(resendapikey);
        await resend.emails.send({
            from: "onboarding@resend.dev",
            to: args.toEmail,
            subject: "Assessment Invitation",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hello ${args.toName},</h2>
          
          <p>You have been invited to complete an assessment for your job application.</p>
          
          <p>Please click the link below to start your assessment:</p>
          
          <div style="margin: 30px 0;">
            <a href="${args.invitationLink}" 
               style="background-color: #4CAF50; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Start Assessment
            </a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p>${args.invitationLink}</p>
          
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          
          <p style="color: #666; font-size: 12px;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      `,
        });
    }
    catch (error) {
        console.error(error);
        return { success: false, errorMessage: "EMAIL_FAILED" };
    }
    return { success: true };
}
const DUMMY_EMAIL_SUBSCRIBER_ID = "00000000-0000-0000-0000-000000000000";
async function logInvitationEmailAttempt(args) {
    // We log invitation email attempts into delivery_attempts using a dummy subscriber id.
    await connect_1.db.insert(schema_1.deliveryAttempts).values({
        attemptNumber: args.attemptNumber,
        statusCode: args.statusCode ?? null,
        success: args.success,
        errorMessage: args.errorMessage ?? null,
        jobId: args.jobId,
        subscriberId: DUMMY_EMAIL_SUBSCRIBER_ID,
    });
}
async function sendInvitationWithRetries(args) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await sendAssessmentInvitationEmail(args);
        await logInvitationEmailAttempt({
            jobId: args.jobId,
            attemptNumber: attempt,
            success: result.success,
            statusCode: null,
            errorMessage: result.success
                ? null
                : (result.errorMessage ?? "EMAIL_FAILED"),
        });
        if (result.success)
            return result;
        if (attempt < maxAttempts) {
            await sleep(5000 * attempt);
        }
    }
    return { success: false, errorMessage: "EMAIL_FAILED" };
}
async function runSmartAtsScreener(args) {
    const asResume = resumeSubmissionSchema.safeParse(args.rawPayload);
    const asAssessment = assessmentSubmissionSchema.safeParse(args.rawPayload);
    if (asResume.success) {
        const jobRequirements = args.actionConfig?.job_requirements ?? args.actionConfig ?? {};
        const ai = await callGeminiWithRetry({
            model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
            resumeText: asResume.data.resume_text,
            candidateName: asResume.data.candidate_info.name,
            candidateEmail: asResume.data.candidate_info.email,
            jobRequirements,
            timeoutMs: 60000,
        });
        const processedPayload = {
            ats: ai,
            candidate: asResume.data.candidate_info,
            phase: "resume",
        };
        // Always persist ATS result into job history
        await connect_1.db
            .update(schema_1.jobs)
            .set({ processedPayload })
            .where((0, drizzle_orm_1.eq)(schema_1.jobs.id, args.jobId));
        if (ai.decision === "FAIL") {
            // Rejected at resume stage: stop the flow and do not notify recruiter.
            await connect_1.db.transaction(async (tx) => {
                // Upsert-like behavior: create a candidate record tied to this job
                await tx.insert(schema_1.candidates).values({
                    pipelineId: args.pipelineId,
                    jobId: args.jobId,
                    name: asResume.data.candidate_info.name,
                    email: asResume.data.candidate_info.email,
                    resumeSummary: ai.resume_summary ?? null,
                    aiScore: Math.round(ai.suitability_score),
                    status: "REJECTED",
                    metadata: null,
                });
            });
            return {
                processedPayload,
                shouldDeliverToSubscribers: false,
                finalJobStatusIfNoDelivery: "completed",
            };
        }
        // PASS at resume stage: store candidate and invite
        await connect_1.db.transaction(async (tx) => {
            await tx.insert(schema_1.candidates).values({
                pipelineId: args.pipelineId,
                jobId: args.jobId,
                name: asResume.data.candidate_info.name,
                email: asResume.data.candidate_info.email,
                resumeSummary: ai.resume_summary ?? null,
                aiScore: Math.round(ai.suitability_score),
                status: "INVITED",
                metadata: null,
            });
        });
        const invitationLink = args.actionConfig?.assessment_link ??
            "https://docs.google.com/forms/d/e/1FAIpQLSegU3SEcC14KLltYNkHy5zbqcMOgCs99UeghXWUV6EqteBywg/viewform?usp=header";
        const emailResult = await sendInvitationWithRetries({
            toEmail: asResume.data.candidate_info.email,
            toName: asResume.data.candidate_info.name,
            invitationLink,
            pipelineId: args.pipelineId,
            jobId: args.jobId,
        });
        // Resume phase never notifies recruiter yet. Candidate must submit assessment.
        return {
            processedPayload,
            shouldDeliverToSubscribers: false,
            finalJobStatusIfNoDelivery: emailResult.success ? "completed" : "failed",
        };
    }
    if (asAssessment.success) {
        // Phase 2: assessment score submission
        const email = asAssessment.data.email;
        const score = asAssessment.data.score;
        const existing = await connect_1.db
            .select()
            .from(schema_1.candidates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.candidates.pipelineId, args.pipelineId), (0, drizzle_orm_1.eq)(schema_1.candidates.email, email)));
        const candidate = existing[0];
        const processedPayload = {
            phase: "assessment",
            assessment: { email, score },
        };
        await connect_1.db
            .update(schema_1.jobs)
            .set({ processedPayload })
            .where((0, drizzle_orm_1.eq)(schema_1.jobs.id, args.jobId));
        if (!candidate) {
            return {
                processedPayload: {
                    ...processedPayload,
                    error: "CANDIDATE_NOT_FOUND",
                },
                shouldDeliverToSubscribers: false,
                finalJobStatusIfNoDelivery: "failed",
            };
        }
        const passed = score > 50;
        await connect_1.db
            .update(schema_1.candidates)
            .set({ status: passed ? "PASSED" : "REJECTED" })
            .where((0, drizzle_orm_1.eq)(schema_1.candidates.id, candidate.id));
        return {
            processedPayload: {
                ...processedPayload,
                candidate: {
                    id: candidate.id,
                    email: candidate.email,
                    name: candidate.name,
                },
            },
            shouldDeliverToSubscribers: passed,
            finalJobStatusIfNoDelivery: "completed",
        };
    }
    // Invalid payload (matches neither phase)
    const processedPayload = {
        ats: {
            error: "INVALID_PAYLOAD",
            issues: {
                resume: asResume.success ? null : asResume.error.issues,
                assessment: asAssessment.success ? null : asAssessment.error.issues,
            },
        },
    };
    await connect_1.db
        .update(schema_1.jobs)
        .set({ processedPayload })
        .where((0, drizzle_orm_1.eq)(schema_1.jobs.id, args.jobId));
    return {
        processedPayload,
        shouldDeliverToSubscribers: false,
        finalJobStatusIfNoDelivery: "failed",
    };
}
