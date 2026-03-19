import { z } from "zod";
import { db } from "../../db/connect";
import { candidates, deliveryAttempts, jobs } from "../../db/schema";
import { and, eq } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Resend } from "resend";

const resumeSubmissionSchema = z.object({
  resume_text: z.string().min(1),
  candidate_info: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

const assessmentSubmissionSchema = z.object({
  email: z.string().email(),
  score: z.number().min(0).max(100),
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
  invitationLink: string;
  pipelineId: string;
  jobId: string;
}): Promise<{ success: boolean; errorMessage?: string }> {
  try {
    const resendapikey = process.env.RESEND_API_KEY;
    if (!resendapikey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    const resend = new Resend(resendapikey);

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
  } catch (error) {
    console.error(error);
    return { success: false, errorMessage: "EMAIL_FAILED" };
  }
  return { success: true };
}

const DUMMY_EMAIL_SUBSCRIBER_ID = "00000000-0000-0000-0000-000000000000";

async function logInvitationEmailAttempt(args: {
  jobId: string;
  attemptNumber: number;
  success: boolean;
  statusCode?: number | null;
  errorMessage?: string | null;
}): Promise<void> {
  // We log invitation email attempts into delivery_attempts using a dummy subscriber id.
  await db.insert(deliveryAttempts).values({
    attemptNumber: args.attemptNumber,
    statusCode: args.statusCode ?? null,
    success: args.success,
    errorMessage: args.errorMessage ?? null,
    jobId: args.jobId,
    subscriberId: DUMMY_EMAIL_SUBSCRIBER_ID,
  });
}

async function sendInvitationWithRetries(args: {
  toEmail: string;
  toName: string;
  invitationLink: string;
  pipelineId: string;
  jobId: string;
}): Promise<{ success: boolean; errorMessage?: string }> {
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
    if (result.success) return result;
    if (attempt < maxAttempts) {
      await sleep(5000 * attempt);
    }
  }
  return { success: false, errorMessage: "EMAIL_FAILED" };
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
  const asResume = resumeSubmissionSchema.safeParse(args.rawPayload);
  const asAssessment = assessmentSubmissionSchema.safeParse(args.rawPayload);

  if (asResume.success) {
    const jobRequirements =
      args.actionConfig?.job_requirements ?? args.actionConfig ?? {};
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
    await db
      .update(jobs)
      .set({ processedPayload })
      .where(eq(jobs.id, args.jobId));

    if (ai.decision === "FAIL") {
      // Rejected at resume stage: stop the flow and do not notify recruiter.
      await db.transaction(async (tx) => {
        // Upsert-like behavior: create a candidate record tied to this job
        await tx.insert(candidates).values({
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
    await db.transaction(async (tx) => {
      await tx.insert(candidates).values({
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

    const invitationLink =
      (args.actionConfig?.assessment_link as string | undefined) ??
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

    const existing = await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.pipelineId, args.pipelineId),
          eq(candidates.email, email),
        ),
      );

    const candidate = existing[0];
    const processedPayload = {
      phase: "assessment",
      assessment: { email, score },
    };

    await db
      .update(jobs)
      .set({ processedPayload })
      .where(eq(jobs.id, args.jobId));

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
    await db
      .update(candidates)
      .set({ status: passed ? "PASSED" : "REJECTED" })
      .where(eq(candidates.id, candidate.id));

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
