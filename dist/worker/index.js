"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const piplines_1 = require("../db/queries/piplines");
const subscribers_1 = require("../db/queries/subscribers");
const jobs_1 = require("../db/queries/jobs");
const deliveryAttempts_1 = require("../db/queries/deliveryAttempts");
const atsScreener_1 = require("./actions/atsScreener");
const workerName = "job-worker";
const POLL_MS = 3000;
const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
console.log(`${workerName} started`);
function runAction(actionType, rawPayload, actionConfig) {
    const obj = typeof rawPayload === "object" && rawPayload !== null
        ? rawPayload
        : { value: rawPayload };
    switch (actionType) {
        case "pass":
            return rawPayload;
        case "json_extract": {
            const fields = actionConfig?.fields;
            if (!Array.isArray(fields) || fields.length === 0)
                return rawPayload;
            const out = {};
            for (const key of fields) {
                if (key in obj)
                    out[key] = obj[key];
            }
            return out;
        }
        case "template": {
            const template = actionConfig?.template ?? "{{payload}}";
            let result = template;
            for (const [key, value] of Object.entries(obj)) {
                result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), String(value));
            }
            return { message: result };
        }
        case "filter": {
            const field = actionConfig?.field;
            const operator = actionConfig?.operator ?? "eq";
            const value = actionConfig?.value;
            if (field === undefined || !(field in obj))
                return rawPayload;
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
async function makePostRequest(url, body) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const success = response.status >= 200 && response.status < 400;
        let errorMessage;
        if (!success) {
            const text = await response.text();
            errorMessage = text.slice(0, 500) || `HTTP ${response.status}`;
        }
        return { statusCode: response.status, success, errorMessage };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            statusCode: 0,
            success: false,
            errorMessage: message,
        };
    }
}
async function recordAttempt(jobId, subscriberId, attemptNumber, result) {
    const attempt = {
        jobId,
        subscriberId,
        attemptNumber,
        statusCode: result.statusCode || null,
        success: result.success,
        errorMessage: result.errorMessage ?? null,
    };
    await (0, deliveryAttempts_1.createDeliveryAttempt)(attempt);
}
async function deliverToSubscriber(targetUrl, payload, jobId, subscriberId) {
    for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
        const result = await makePostRequest(targetUrl, payload);
        await recordAttempt(jobId, subscriberId, attempt, result);
        if (result.success)
            return true;
        if (attempt < MAX_DELIVERY_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        }
    }
    return false;
}
async function processJob(job) {
    const pipeline = await (0, piplines_1.getPipelineById)(job.pipelineId);
    if (!pipeline) {
        console.log(`failed to fetch pipeline from process Job piplineid=${job.pipelineId} the job is ${JSON.stringify(job)}`);
        await (0, jobs_1.setJobStatus)(job.id, "failed");
        return;
    }
    let processedPayload;
    let shouldDeliverToSubscribers = true;
    let finalJobStatusIfNoDelivery = "completed";
    if (pipeline.actionType === "SMART_ATS_SCREENER") {
        const atsResult = await (0, atsScreener_1.runSmartAtsScreener)({
            jobId: job.id,
            pipelineId: pipeline.id,
            rawPayload: job.rawPayload,
            actionConfig: pipeline.actionConfig,
        });
        processedPayload = atsResult.processedPayload;
        shouldDeliverToSubscribers = atsResult.shouldDeliverToSubscribers;
        finalJobStatusIfNoDelivery = atsResult.finalJobStatusIfNoDelivery;
    }
    else {
        processedPayload = runAction(pipeline.actionType, job.rawPayload, pipeline.actionConfig);
        await (0, jobs_1.updateJobProcessedPayload)(job.id, processedPayload);
    }
    if (processedPayload === null) {
        await (0, jobs_1.setJobStatus)(job.id, "completed");
        return;
    }
    if (!shouldDeliverToSubscribers) {
        await (0, jobs_1.setJobStatus)(job.id, finalJobStatusIfNoDelivery);
        return;
    }
    const subscribers = await (0, subscribers_1.getAllSubscribers)(job.pipelineId);
    if (!subscribers?.length) {
        await (0, jobs_1.setJobStatus)(job.id, "completed");
        return;
    }
    const activeSubscribers = subscribers.filter((s) => s.isActive);
    const deliveryPromises = activeSubscribers.map((sub) => deliverToSubscriber(sub.targetUrl, processedPayload, job.id, sub.id));
    const results = await Promise.all(deliveryPromises);
    const allOk = results.every((ok) => ok);
    await (0, jobs_1.setJobStatus)(job.id, allOk ? "completed" : "failed");
}
async function runCycle() {
    try {
        const jobs = await (0, jobs_1.claimPendingJobs)(5);
        for (const job of jobs) {
            try {
                await processJob(job);
            }
            catch (err) {
                console.error(`${workerName} error processing job ${job.id}:`, err);
                await (0, jobs_1.setJobStatus)(job.id, "failed");
            }
        }
    }
    catch (err) {
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
