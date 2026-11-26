import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env before anything else — must run before OpenAI client is created
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

import OpenAI from 'openai';

// Provider-agnostic: works with OpenAI, Gemini (OpenAI-compat), Groq, OpenRouter, Ollama, etc.
// Fail fast (25s timeout, 0 SDK retries) so our fallback loop switches models immediately.
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey:  process.env.LLM_API_KEY  || 'no-key',
  timeout: 25000,
  maxRetries: 0,
});

const GRAPH_MODEL = process.env.GRAPH_MODEL || process.env.LLM_MODEL || 'gemini-flash-lite-latest';
const CHAT_MODEL  = process.env.CHAT_MODEL  || process.env.LLM_MODEL || 'gemini-flash-lite-latest';

console.log(`[LLM] baseURL=${process.env.LLM_BASE_URL}, graphModel=${GRAPH_MODEL}, chatModel=${CHAT_MODEL}, key=${process.env.LLM_API_KEY?.slice(0,12)}…`);

const FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
];

const GRAPH_CANDIDATE_MODELS = Array.from(new Set([GRAPH_MODEL, ...FALLBACK_MODELS]));
const CHAT_CANDIDATE_MODELS  = Array.from(new Set([CHAT_MODEL, ...FALLBACK_MODELS]));

/** One-shot completion for graph generation (returns full text) */
export async function generateCompletion(systemPrompt, userPrompt) {
  let lastErr = null;
  for (const model of GRAPH_CANDIDATE_MODELS) {
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) {
        throw new Error(`Empty response from model ${model}`);
      }
      return content;
    } catch (err) {
      lastErr = err;
      console.warn(`[LLM] Model ${model} failed (${err.status || err.message}). Trying fallback…`);
      // Brief backoff on rate-limit / overload before trying the next model
      if (err.status === 429 || err.status === 503) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  throw lastErr;
}

/** Streaming chat completion — yields delta chunks */
export async function* streamCompletion(messages) {
  let lastErr = null;
  for (const model of CHAT_CANDIDATE_MODELS) {
    let yielded = false;
    try {
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.5,
        max_tokens: 2048,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yielded = true;
          yield delta;
        }
      }
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[LLM Chat] Model ${model} failed (${err.status || err.message}). Trying fallback…`);
      if (yielded) throw err;
    }
  }
  throw lastErr;
}
