import "dotenv/config";
import { Job, NewDeliveryAttempt } from "../db/schema";
import { getPipelineById } from "../db/queries/piplines";
import { getAllSubscribers } from "../db/queries/subscribers";
import {
  claimPendingJobs,
  setJobStatus,
  updateJobProcessedPayload,
} from "../db/queries/jobs";
import { createDeliveryAttempt } from "../db/queries/deliveryAttempts";
import { runSmartAtsScreener } from "./actions/atsScreener";
import { runGithubActivityStoryteller } from "./actions/githubStoryteller";
import { runScheduledProcessor } from "./actions/scheduledProcessor";

const workerName = "job-worker";
const POLL_MS = 3000;
const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;
const DUMMY_EMAIL_SUBSCRIBER_ID = "00000000-0000-0000-0000-000000000000";
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
console.log(`${workerName} started`);

function runAction(actionType: string): never {
  throw new Error(`Unsupported actionType: ${actionType}`);
}

async function makePostRequest(
  url: string,
  body: unknown,
): Promise<{ statusCode: number; success: boolean; errorMessage?: string }> {
  try {
    const isSlackWebhook = url.startsWith("https://hooks.slack.com/services/");
    const payload = isSlackWebhook ? { text: formatSlackText(body) } : body;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const success = response.status >= 200 && response.status < 400;
    let errorMessage: string | undefined;
    if (!success) {
      const text = await response.text();
      errorMessage = text.slice(0, 500) || `HTTP ${response.status}`;
    }
    return { statusCode: response.status, success, errorMessage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 0,
      success: false,
      errorMessage: message,
    };
  }
}

function formatSlackText(body: unknown): string {
  // Prefer story output if present
  if (body && typeof body === "object") {
    const b: any = body;
    const story = b?.story;
    if (story?.title && story?.summary) {
      const highlights = Array.isArray(story.highlights)
        ? story.highlights.map((h: string) => `• ${h}`).join("\n")
        : "";
      const risks = Array.isArray(story.riskNotes) && story.riskNotes.length
        ? `\n\nRisks/notes:\n${story.riskNotes
            .map((r: string) => `• ${r}`)
            .join("\n")}`
        : "";
      return `*${story.title}*\n${story.summary}\n\nHighlights:\n${highlights}${risks}`.trim();
    }

    // Fall back to a generic string
    if (typeof b.message === "string") return b.message;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

async function recordAttempt(
  jobId: string,
  subscriberId: string,
  attemptNumber: number,
  result: { statusCode: number; success: boolean; errorMessage?: string },
): Promise<void> {
  const attempt: NewDeliveryAttempt = {
    jobId,
    subscriberId,
    attemptNumber,
    statusCode: result.statusCode || null,
    success: result.success,
    errorMessage: result.errorMessage ?? null,
  };
  await createDeliveryAttempt(attempt);
}

async function deliverToSubscriber(
  targetUrl: string,
  payload: unknown,
  jobId: string,
  subscriberId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
    const result = await makePostRequest(targetUrl, payload);
    await recordAttempt(jobId, subscriberId, attempt, result);
    if (result.success) return true;
    if (attempt < MAX_DELIVERY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  return false;
}

async function processJob(job: Job): Promise<void> {
  const pipeline = await getPipelineById(job.pipelineId);
  if (!pipeline) {
    console.log(
      `failed to fetch pipeline from process Job piplineid=${job.pipelineId} the job is ${JSON.stringify(job)}`,
    );
    await setJobStatus(job.id, "failed");
    return;
  }

  let processedPayload: unknown;
  let shouldDeliverToSubscribers = true;
  let finalJobStatusIfNoDelivery: "completed" | "failed" = "completed";

  if (pipeline.actionType === "SMART_ATS_SCREENER") {
    const atsResult = await runSmartAtsScreener({
      jobId: job.id,
      pipelineId: pipeline.id,
      rawPayload: job.rawPayload,
      actionConfig: pipeline.actionConfig,
    });
    processedPayload = atsResult.processedPayload;
    shouldDeliverToSubscribers = atsResult.shouldDeliverToSubscribers;
    finalJobStatusIfNoDelivery = atsResult.finalJobStatusIfNoDelivery;
  } else if (pipeline.actionType === "GITHUB_ACTIVITY_STORYTELLER") {
    const storyResult = await runGithubActivityStoryteller({
      rawPayload: job.rawPayload,
      actionConfig: pipeline.actionConfig,
    });
    processedPayload = storyResult.processedPayload;
    shouldDeliverToSubscribers = storyResult.shouldDeliverToSubscribers;
    finalJobStatusIfNoDelivery = storyResult.finalJobStatusIfNoDelivery;
    await updateJobProcessedPayload(job.id, processedPayload);
  } else if (pipeline.actionType === "SCHEDULED_PROCESSOR") {
    const alreadyScheduled = job.nextRunAt !== null;
    const schedResult = await runScheduledProcessor({
      jobId: job.id,
      rawPayload: job.rawPayload,
      processedPayload: job.processedPayload,
      actionConfig: pipeline.actionConfig,
      alreadyScheduled,
    });

    processedPayload = schedResult.processedPayload;

    if (schedResult.kind === "scheduled") {
      // Job has been re-queued (status=pending, nextRunAt set). Stop processing now.
      return;
    }
    if (schedResult.kind === "error") {
      await updateJobProcessedPayload(job.id, processedPayload);
      await setJobStatus(job.id, "failed");
      return;
    }
    // deliver_now falls through to normal subscriber delivery using processedPayload
  } else {
    try {
      runAction(pipeline.actionType);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      processedPayload = { error: message };
      await updateJobProcessedPayload(job.id, processedPayload);
      await setJobStatus(job.id, "failed");
      return;
    }
  }

  if (processedPayload === null) {
    await setJobStatus(job.id, "completed");
    return;
  }

  if (!shouldDeliverToSubscribers) {
    await setJobStatus(job.id, finalJobStatusIfNoDelivery);
    return;
  }

  const subscribers = await getAllSubscribers(job.pipelineId);
  if (!subscribers?.length) {
    await setJobStatus(job.id, "completed");
    return;
  }

  // Never attempt webhook delivery for the dummy "email" subscriber.
  const activeSubscribers = subscribers.filter(
    (s) => s.isActive && s.id !== DUMMY_EMAIL_SUBSCRIBER_ID,
  );
  const deliveryPromises = activeSubscribers.map((sub) =>
    deliverToSubscriber(sub.targetUrl, processedPayload, job.id, sub.id),
  );
  const results = await Promise.all(deliveryPromises);
  const allOk = results.every((ok) => ok);

  await setJobStatus(job.id, allOk ? "completed" : "failed");
}

async function runCycle(): Promise<void> {
  try {
    const jobs = await claimPendingJobs(5);
    for (const job of jobs) {
      try {
        await processJob(job);
      } catch (err) {
        console.error(`${workerName} error processing job ${job.id}:`, err);
        await setJobStatus(job.id, "failed");
      }
    }
  } catch (err) {
    console.error(`${workerName} poll error:`, err);
  }
}

async function loop() {
  while (true) {
    await runCycle();
    await sleep(POLL_MS);
  }
}

void loop();
