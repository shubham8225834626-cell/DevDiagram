import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env before anything else — must run before OpenAI client is created
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

import OpenAI from 'openai';

// Provider-agnostic: works with OpenAI, Gemini (OpenAI-compat), Groq, OpenRouter, Ollama, etc.
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey:  process.env.LLM_API_KEY  || 'no-key',
});

const GRAPH_MODEL = process.env.GRAPH_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini';
const CHAT_MODEL  = process.env.CHAT_MODEL  || process.env.LLM_MODEL || 'gpt-4o-mini';

console.log(`[LLM] baseURL=${process.env.LLM_BASE_URL}, model=${GRAPH_MODEL}, key=${process.env.LLM_API_KEY?.slice(0,12)}…`);

// Deduplicated list of models to try if the primary hits rate-limits or 503
const CANDIDATE_MODELS = Array.from(new Set([
  GRAPH_MODEL,
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
]));

/** One-shot completion for graph generation (returns full text) */
export async function generateCompletion(systemPrompt, userPrompt) {
  let lastErr = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      });
      return resp.choices[0]?.message?.content || '';
    } catch (err) {
      lastErr = err;
      console.warn(`[LLM] Model ${model} failed (${err.status || err.message}). Trying fallback…`);
      // If 429 or 503, wait 800ms before trying the next model
      if (err.status === 429 || err.status === 503) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw lastErr;
}

/** Streaming chat completion — yields delta chunks */
export async function* streamCompletion(messages) {
  let lastErr = null;
  for (const model of CANDIDATE_MODELS) {
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
        if (delta) yield delta;
      }
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[LLM Chat] Model ${model} failed (${err.status || err.message}). Trying fallback…`);
    }
  }
  throw lastErr;
}
