import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import OpenAI from 'openai';
import { withRetry } from '../utils/retry.js';
import { geminiBudgetBreaker } from '../utils/budgetBreaker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.LLM_API_KEY || 'no-key',
  timeout: 25000,
  maxRetries: 0,
});

const GRAPH_MODEL = process.env.GRAPH_MODEL || process.env.LLM_MODEL || 'gemini-flash-lite-latest';
const CHAT_MODEL = process.env.CHAT_MODEL || process.env.LLM_MODEL || 'gemini-flash-lite-latest';

const FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
];

const GRAPH_CANDIDATE_MODELS = Array.from(new Set([GRAPH_MODEL, ...FALLBACK_MODELS]));
const CHAT_CANDIDATE_MODELS = Array.from(new Set([CHAT_MODEL, ...FALLBACK_MODELS]));

// ── Concurrency & Backpressure Queue (p-limit) ────────────────────────────────
function createQueue() {
  const concurrency = Math.max(1, Number(process.env.LLM_MAX_CONCURRENCY || 4));
  const limiter = pLimit(concurrency);

  function getMaxQueue() {
    return Math.max(0, Number(process.env.LLM_MAX_QUEUE ?? 16));
  }

  async function enqueue(fn) {
    const maxQueue = getMaxQueue();
    if (limiter.pendingCount >= maxQueue) {
      const err = new Error('AI processing queue is full. Please try again shortly.');
      err.status = 503;
      err.code = 'QUEUE_FULL';
      throw err;
    }
    return limiter(fn);
  }

  function stats() {
    return {
      activeCount: limiter.activeCount,
      pendingCount: limiter.pendingCount,
      maxQueue: getMaxQueue(),
    };
  }

  return { enqueue, stats };
}

export const llmQueue = createQueue();

/** One-shot completion for graph generation (queued, budgeted, retried with backoff, no tools) */
export async function generateCompletion(systemPrompt, userPrompt) {
  return llmQueue.enqueue(async () => {
    geminiBudgetBreaker.consume(1);

    let lastErr = null;
    for (const model of GRAPH_CANDIDATE_MODELS) {
      try {
        return await withRetry(
          async () => {
            const resp = await client.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.2,
              max_tokens: 4096,
            });
            const content = resp.choices[0]?.message?.content;
            if (!content) {
              throw new Error(`Empty response from model ${model}`);
            }
            return content;
          },
          { retries: 1, baseDelayMs: 250 }
        );
      } catch (err) {
        lastErr = err;
        console.warn(`[LLM] Model ${model} failed (${err.status || err.message}). Trying fallback…`);
      }
    }
    throw lastErr;
  });
}

/** Streaming chat completion — yields delta chunks, supports AbortSignal on client disconnect */
export async function* streamCompletion(messages, options = {}) {
  const { signal } = options;
  geminiBudgetBreaker.consume(1);

  let lastErr = null;
  for (const model of CHAT_CANDIDATE_MODELS) {
    let yielded = false;
    try {
      const stream = await client.chat.completions.create(
        {
          model,
          messages,
          temperature: 0.5,
          max_tokens: 2048,
          stream: true,
        },
        signal ? { signal } : undefined
      );

      for await (const chunk of stream) {
        if (signal?.aborted) return;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yielded = true;
          yield delta;
        }
      }
      return;
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') return;
      lastErr = err;
      console.warn(`[LLM Chat] Model ${model} failed (${err.status || err.message}). Trying fallback…`);
      if (yielded) throw err;
    }
  }
  throw lastErr;
}
