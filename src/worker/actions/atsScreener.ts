import { z } from "zod";
import { db } from "../../db/connect";
import { candidates, deliveryEvents, jobs } from "../../db/schema";
import { eq } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const atsWebhookSchema = z.object({
  resume_text: z.string().min(1),
  candidate_info: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

const atsAiOutputSchema = z.object({
  suitability_score: z.number().min(0).max(100),
  decision: z.enum(["PASS", "FAIL"]),
  reasoning: z.string().min(1),
  resume_summary: z.string().min(1).optional(),
});

export type AtsAiOutput = z.infer<typeof atsAiOutputSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

async function callGeminiWithRetry(args: {
  model: string;
  resumeText: string;
  candidateName: string;
  candidateEmail: string;
  jobRequirements: unknown;
  timeoutMs: number;
}): Promise<AtsAiOutput> {
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

      const text = (result as any)?.response?.text?.() as string | undefined;
      if (!text) throw new Error("Gemini response had no text");

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
      }

      return atsAiOutputSchema.parse(parsed);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        message.includes("429") ||
        message.toLowerCase().includes("rate limit") ||
        err?.status === 429;
      const isRetryable =
        isRateLimit ||
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

async function sendAssessmentInvitationEmail(args: {
  toEmail: string;
  toName: string;
  pipelineId: string;
  jobId: string;
}): Promise<{ success: boolean; errorMessage?: string }> {
  // Placeholder: integrate SendGrid/Postmark later.
  // Simulate success.
  void args;
  return { success: true };
}

async function logEmailAttempt(args: {
  pipelineId: string;
  jobId: string;
  targetEmail: string;
  attemptNumber: number;
  success: boolean;
  statusCode?: number | null;
  errorMessage?: string | null;
}): Promise<void> {
  await db.insert(deliveryEvents).values({
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

export async function runSmartAtsScreener(args: {
  jobId: string;
  pipelineId: string;
  rawPayload: unknown;
  actionConfig: Record<string, unknown> | null;
}): Promise<{
  processedPayload: unknown;
  shouldDeliverToSubscribers: boolean;
  finalJobStatusIfNoDelivery: "completed" | "failed";
}> {
  const parsed = atsWebhookSchema.safeParse(args.rawPayload);
  if (!parsed.success) {
    const processedPayload = {
      ats: {
        error: "INVALID_PAYLOAD",
        issues: parsed.error.issues,
      },
    };
    await db
      .update(jobs)
      .set({ processedPayload })
      .where(eq(jobs.id, args.jobId));
    return {
      processedPayload,
      shouldDeliverToSubscribers: false,
      finalJobStatusIfNoDelivery: "failed",
    };
  }

  const jobRequirements =
    args.actionConfig?.job_requirements ?? args.actionConfig ?? {};
  const ai = await callGeminiWithRetry({
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    resumeText: parsed.data.resume_text,
    candidateName: parsed.data.candidate_info.name,
    candidateEmail: parsed.data.candidate_info.email,
    jobRequirements,
    timeoutMs: 60000,
  });

  const processedPayload = {
    ats: ai,
    candidate: parsed.data.candidate_info,
  };

  if (ai.decision === "FAIL") {
    // Persist rejection in job history and stop deliveries for this job.
    await db.transaction(async (tx) => {
      await tx
        .update(jobs)
        .set({ processedPayload })
        .where(eq(jobs.id, args.jobId));
    });
    return {
      processedPayload,
      shouldDeliverToSubscribers: false,
      finalJobStatusIfNoDelivery: "completed",
    };
  }

  // PASS branch: persist candidate + processed payload atomically
  await db.transaction(async (tx) => {
    await tx
      .update(jobs)
      .set({ processedPayload })
      .where(eq(jobs.id, args.jobId));
    await tx.insert(candidates).values({
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
    errorMessage: emailResult.success
      ? null
      : (emailResult.errorMessage ?? "EMAIL_FAILED"),
  });

  if (!emailResult.success) {
    return {
      processedPayload,
      shouldDeliverToSubscribers: false,
      finalJobStatusIfNoDelivery: "failed",
    };
  }

  // Mark invited (optional, but helps demonstrate branching persistence)
  await db
    .update(candidates)
    .set({ status: "invited" })
    .where(eq(candidates.jobId, args.jobId));

  return {
    processedPayload,
    shouldDeliverToSubscribers: true,
    finalJobStatusIfNoDelivery: "completed",
  };
}
