import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Validate only the GitHub Push fields we need
export const githubPushSchema = z.object({
  ref: z.string().min(1),
  repository: z.object({
    full_name: z.string().min(1),
  }),
  pusher: z.object({
    name: z.string().min(1),
  }),
  commits: z
    .array(
      z.object({
        id: z.string().min(1),
        message: z.string().min(1),
        author: z
          .object({
            name: z.string().min(1),
          })
          .optional(),
        added: z.array(z.string()).optional().default([]),
        removed: z.array(z.string()).optional().default([]),
        modified: z.array(z.string()).optional().default([]),
      }),
    )
    .default([]),
});

export type GithubPushEvent = z.infer<typeof githubPushSchema>;

export type StorytellerInput = {
  repo: string;
  branch: string;
  pusher: string;
  commitCount: number;
  commits: { id: string; message: string; author?: string }[];
  changedFiles: string[];
};

export function extractStorytellerInput(
  raw: GithubPushEvent,
  opts?: { maxCommits?: number; maxFiles?: number; includeFiles?: boolean },
): StorytellerInput {
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

  const filesSet = new Set<string>();
  if (includeFiles) {
    for (const c of raw.commits) {
      for (const f of c.added ?? []) filesSet.add(f);
      for (const f of c.modified ?? []) filesSet.add(f);
      for (const f of c.removed ?? []) filesSet.add(f);
      if (filesSet.size >= maxFiles) break;
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

const storySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  highlights: z.array(z.string().min(1)).min(1),
  riskNotes: z.array(z.string().min(1)).optional().default([]),
});

export type StoryOutput = z.infer<typeof storySchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

async function callGeminiStoryWithRetry(args: {
  model: string;
  input: StorytellerInput;
  tone: string;
  audience: string;
  maxLength: number;
  timeoutMs: number;
}): Promise<StoryOutput> {
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

      const text = (result as any)?.response?.text?.() as string | undefined;
      if (!text) throw new Error("Gemini response had no text");

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
      }

      return storySchema.parse(parsed);
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

      if (attempt === maxAttempts || !isRetryable) throw err;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw new Error("Unreachable Gemini retry loop");
}

export async function runGithubActivityStoryteller(args: {
  rawPayload: unknown;
  actionConfig: Record<string, unknown> | null;
}): Promise<{
  processedPayload: unknown;
  shouldDeliverToSubscribers: boolean;
  finalJobStatusIfNoDelivery: "completed" | "failed";
}> {
  const parsed = githubPushSchema.safeParse(args.rawPayload);
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

  const tone = (args.actionConfig?.tone as string) ?? "friendly";
  const audience = (args.actionConfig?.audience as string) ?? "non-technical";
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

