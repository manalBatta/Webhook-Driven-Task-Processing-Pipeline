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

const workerName = "job-worker";
const POLL_MS = 3000;
const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;
const DUMMY_EMAIL_SUBSCRIBER_ID = "00000000-0000-0000-0000-000000000000";
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
console.log(`${workerName} started`);

function runAction(
  actionType: string,
  rawPayload: unknown,
  actionConfig: Record<string, unknown> | null,
): unknown {
  const obj =
    typeof rawPayload === "object" && rawPayload !== null
      ? (rawPayload as Record<string, unknown>)
      : { value: rawPayload };

  switch (actionType) {
    case "pass":
      return rawPayload;

    case "json_extract": {
      const fields = actionConfig?.fields as string[] | undefined;
      if (!Array.isArray(fields) || fields.length === 0) return rawPayload;
      const out: Record<string, unknown> = {};
      for (const key of fields) {
        if (key in obj) out[key] = obj[key];
      }
      return out;
    }

    case "template": {
      const template = (actionConfig?.template as string) ?? "{{payload}}";
      let result = template;
      for (const [key, value] of Object.entries(obj)) {
        result = result.replace(
          new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
          String(value),
        );
      }
      return { message: result };
    }

    case "filter": {
      const field = actionConfig?.field as string | undefined;
      const operator = (actionConfig?.operator as string) ?? "eq";
      const value = actionConfig?.value;
      if (field === undefined || !(field in obj)) return rawPayload;
      const actual = obj[field];
      let pass = false;
      switch (operator) {
        case "eq":
          pass = actual === value;
          break;
        case "neq":
          pass = actual !== value;
          break;
        case "gt":
          pass =
            typeof actual === "number" &&
            typeof value === "number" &&
            actual > value;
          break;
        case "gte":
          pass =
            typeof actual === "number" &&
            typeof value === "number" &&
            actual >= value;
          break;
        case "lt":
          pass =
            typeof actual === "number" &&
            typeof value === "number" &&
            actual < value;
          break;
        case "lte":
          pass =
            typeof actual === "number" &&
            typeof value === "number" &&
            actual <= value;
          break;
        default:
          pass = actual === value;
      }
      return pass ? rawPayload : null;
    }

    default:
      return rawPayload;
  }
}

async function makePostRequest(
  url: string,
  body: unknown,
): Promise<{ statusCode: number; success: boolean; errorMessage?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  } else {
    processedPayload = runAction(
      pipeline.actionType,
      job.rawPayload,
      pipeline.actionConfig,
    );
    await updateJobProcessedPayload(job.id, processedPayload);
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
