"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubPushSchema = void 0;
exports.extractStorytellerInput = extractStorytellerInput;
exports.runGithubActivityStoryteller = runGithubActivityStoryteller;
const zod_1 = require("zod");
const generative_ai_1 = require("@google/generative-ai");
// Validate only the GitHub Push fields we need
exports.githubPushSchema = zod_1.z.object({
    ref: zod_1.z.string().min(1),
    repository: zod_1.z.object({
        full_name: zod_1.z.string().min(1),
    }),
    pusher: zod_1.z.object({
        name: zod_1.z.string().min(1),
    }),
    commits: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        message: zod_1.z.string().min(1),
        author: zod_1.z
            .object({
            name: zod_1.z.string().min(1),
        })
            .optional(),
        added: zod_1.z.array(zod_1.z.string()).optional().default([]),
        removed: zod_1.z.array(zod_1.z.string()).optional().default([]),
        modified: zod_1.z.array(zod_1.z.string()).optional().default([]),
    }))
        .default([]),
});
function extractStorytellerInput(raw, opts) {
    const maxCommits = opts?.maxCommits ?? 10;
    const maxFiles = opts?.maxFiles ?? 30;
    const includeFiles = opts?.includeFiles ?? true;
    const branch = raw.ref.includes("/")
        ? raw.ref.split("/").slice(2).join("/")
        : raw.ref;
    const commits = raw.commits.slice(0, maxCommits).map((c) => ({
        id: c.id,
        message: c.message.slice(0, 200),
        author: c.author?.name,
    }));
    const filesSet = new Set();
    if (includeFiles) {
        for (const c of raw.commits) {
            for (const f of c.added ?? [])
                filesSet.add(f);
            for (const f of c.modified ?? [])
                filesSet.add(f);
            for (const f of c.removed ?? [])
                filesSet.add(f);
            if (filesSet.size >= maxFiles)
                break;
        }
    }
    return {
        repo: raw.repository.full_name,
        branch,
        pusher: raw.pusher.name,
        commitCount: raw.commits.length,
        commits,
        changedFiles: Array.from(filesSet),
    };
}
const storySchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    summary: zod_1.z.string().min(1),
    highlights: zod_1.z.array(zod_1.z.string().min(1)).min(1),
    riskNotes: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
});
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        throw new Error("GEMINI_API_KEY is not set");
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
}
async function callGeminiStoryWithRetry(args) {
    const client = getGeminiClient();
    const maxAttempts = 3;
    const prompt = [
        "You are a product-friendly technical storyteller.",
        `Audience: ${args.audience}`,
        `Tone: ${args.tone}`,
        `Max length (characters) for summary: ${args.maxLength}`,
        "",
        "Take this GitHub push event summary and explain what changed in a friendly, non-technical way.",
        "Return ONLY valid JSON (no markdown, no code fences) with keys:",
        '{"title":"...","summary":"...","highlights":["..."],"riskNotes":["..."]}',
        "",
        `INPUT_JSON: ${JSON.stringify(args.input)}`,
    ].join("\n");
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const model = client.getGenerativeModel({ model: args.model });
            const result = await Promise.race([
                model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.3 },
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
            return storySchema.parse(parsed);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const isRateLimit = message.includes("429") ||
                message.toLowerCase().includes("rate limit") ||
                err?.status === 429;
            const isRetryable = isRateLimit ||
                message.toLowerCase().includes("timeout") ||
                err?.status >= 500;
            if (attempt === maxAttempts || !isRetryable)
                throw err;
            await sleep(1000 * 2 ** (attempt - 1));
        }
    }
    throw new Error("Unreachable Gemini retry loop");
}
async function runGithubActivityStoryteller(args) {
    const parsed = exports.githubPushSchema.safeParse(args.rawPayload);
    if (!parsed.success) {
        return {
            processedPayload: {
                error: "INVALID_GITHUB_PUSH_PAYLOAD",
                issues: parsed.error.issues,
            },
            shouldDeliverToSubscribers: false,
            finalJobStatusIfNoDelivery: "failed",
        };
    }
    const tone = args.actionConfig?.tone ?? "friendly";
    const audience = args.actionConfig?.audience ?? "non-technical";
    const maxLength = Number(args.actionConfig?.maxLength ?? 500);
    const includeFiles = Boolean(args.actionConfig?.includeFiles ?? true);
    const input = extractStorytellerInput(parsed.data, {
        includeFiles,
        maxCommits: 10,
        maxFiles: 30,
    });
    const story = await callGeminiStoryWithRetry({
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        input,
        tone,
        audience,
        maxLength,
        timeoutMs: 20000,
    });
    return {
        processedPayload: {
            type: "github_activity_story",
            input,
            story,
        },
        shouldDeliverToSubscribers: true,
        finalJobStatusIfNoDelivery: "completed",
    };
}
