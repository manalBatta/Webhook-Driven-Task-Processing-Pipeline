"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const API_URL = process.env.API_URL || "http://localhost:3000";
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // 1 second
/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 500) {
    let lastError = null;
    let delay = initialDelay;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (i < maxRetries - 1) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2;
            }
        }
    }
    throw lastError || new Error("Max retries exceeded");
}
/**
 * Wait for API to be healthy
 */
async function waitForAPI(maxRetries = MAX_RETRIES) {
    console.log(`Waiting for API at ${API_URL} to be healthy...`);
    await retryWithBackoff(async () => {
        const response = await fetch(`${API_URL}/jobs`, {
            method: "GET",
        });
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
    }, maxRetries);
    console.log("✓ API is healthy");
}
(0, vitest_1.describe)("API Integration Tests", () => {
    (0, vitest_1.beforeAll)(async () => {
        // Wait for API to start before running tests
        await waitForAPI();
    });
    (0, vitest_1.describe)("Health Check", () => {
        (0, vitest_1.it)("should respond to GET /jobs endpoint", async () => {
            const response = await fetch(`${API_URL}/jobs`);
            (0, vitest_1.expect)(response.status).toBe(200);
            const data = await response.json();
            (0, vitest_1.expect)(Array.isArray(data)).toBe(true);
        });
    });
    (0, vitest_1.describe)("Pipelines", () => {
        let pipelineId;
        (0, vitest_1.it)("should create a new pipeline", async () => {
            const newPipeline = {
                name: "Test Pipeline",
                // sourceKey: `test-key-${Date.now()}`,
                actionType: "GITHUB_ACTIVITY_STORYTELLER",
                actionConfig: {
                    tone: "friendly",
                    audience: "non-technical",
                    maxLength: 500,
                    includeFiles: true
                },
            };
            const response = await fetch(`${API_URL}/pipelines`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(newPipeline),
            });
            (0, vitest_1.expect)(response.status).toBe(201);
            const data = await response.json();
            (0, vitest_1.expect)(Array.isArray(data)).toBe(true);
            (0, vitest_1.expect)(data).toHaveLength(1);
            (0, vitest_1.expect)(data[0]).toHaveProperty("id");
            (0, vitest_1.expect)(data[0]).toHaveProperty("sourceKey");
            (0, vitest_1.expect)(data[0].name).toBe(newPipeline.name);
            (0, vitest_1.expect)(typeof data[0].sourceKey).toBe("string");
            (0, vitest_1.expect)(data[0].sourceKey).toBeTruthy();
            pipelineId = data[0].id;
        });
        (0, vitest_1.it)("should retrieve pipelines", async () => {
            const response = await fetch(`${API_URL}/pipelines`);
            (0, vitest_1.expect)(response.status).toBe(200);
            const data = await response.json();
            (0, vitest_1.expect)(Array.isArray(data)).toBe(true);
            (0, vitest_1.expect)(data.length).toBeGreaterThan(0);
        });
        (0, vitest_1.it)("should retrieve specific pipeline", async () => {
            (0, vitest_1.expect)(pipelineId).toBeDefined();
            const response = await fetch(`${API_URL}/pipelines/${pipelineId}`);
            (0, vitest_1.expect)(response.status).toBe(200);
            const data = await response.json();
            (0, vitest_1.expect)(data.id).toBe(pipelineId);
        });
    });
    (0, vitest_1.describe)("Webhooks & Jobs", () => {
        let sourceKey;
        (0, vitest_1.it)("should create a pipeline for webhook testing", async () => {
            sourceKey = `webhook-test-${Date.now()}`;
            const newPipeline = {
                name: "Webhook Test Pipeline",
                actionType: "SCHEDULED_PROCESSOR",
                actionConfig: {},
            };
            const response = await fetch(`${API_URL}/pipelines`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(newPipeline),
            });
            const data = await response.json();
            sourceKey = data[0].sourceKey;
            (0, vitest_1.expect)(response.status).toBe(201);
        });
        (0, vitest_1.it)("should ingest webhook and create job", async () => {
            const webhookPayload = {
                candidateName: "John Doe",
                email: "john@example.com",
                resumeUrl: "https://example.com/resume.pdf",
            };
            const response = await fetch(`${API_URL}/webhooks/${sourceKey}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(webhookPayload),
            });
            (0, vitest_1.expect)(response.status).toBe(202);
            const data = await response.json();
            (0, vitest_1.expect)(data).toHaveProperty("id");
            (0, vitest_1.expect)(data.status).toBe("pending");
        });
        (0, vitest_1.it)("should reject webhook for non-existent pipeline", async () => {
            const response = await fetch(`${API_URL}/webhooks/non-existent-key-${Date.now()}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ test: "data" }),
            });
            (0, vitest_1.expect)(response.status).toBe(404);
        });
    });
    (0, vitest_1.describe)("Subscribers", () => {
        let pipelineId;
        (0, vitest_1.it)("should create a pipeline for subscriber testing", async () => {
            const newPipeline = {
                name: "Subscriber Test Pipeline",
                actionType: "SMART_ATS_SCREENER",
                actionConfig: {},
            };
            const response = await fetch(`${API_URL}/pipelines`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(newPipeline),
            });
            const data = await response.json();
            pipelineId = data[0].id;
        });
        (0, vitest_1.it)("should add subscriber to pipeline", async () => {
            const newSubscriber = {
                targetUrl: "https://example.com/webhook",
                isActive: true,
            };
            const response = await fetch(`${API_URL}/pipelines/${pipelineId}/subscribers`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(newSubscriber),
            });
            (0, vitest_1.expect)(response.status).toBe(201);
            const data = await response.json();
            (0, vitest_1.expect)(data).toHaveProperty("id");
            (0, vitest_1.expect)(data.targetUrl).toBe(newSubscriber.targetUrl);
        });
        (0, vitest_1.it)("should retrieve subscribers for pipeline", async () => {
            const response = await fetch(`${API_URL}/pipelines/${pipelineId}/subscribers`);
            console.log("api url=", API_URL);
            (0, vitest_1.expect)(response.status).toBe(200);
            const data = await response.json();
            (0, vitest_1.expect)(Array.isArray(data)).toBe(true);
        });
    });
});
