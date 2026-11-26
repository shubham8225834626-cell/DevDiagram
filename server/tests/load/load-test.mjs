import http from 'http';
import assert from 'assert';
import autocannon from 'autocannon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Configure queue & environment BEFORE importing server modules (llm.js reads env at module load)
process.env.AUTH_SECRET = 'load-test-secret-key';
process.env.LLM_MAX_CONCURRENCY = '2';
process.env.LLM_MAX_QUEUE = '2';
process.env.DAILY_GEMINI_LIMIT = '10000';
process.env.AUTH_DIAGRAM_RATE_LIMIT = '5000';
process.env.GLOBAL_RATE_MAX = '5000';

let llmCallCount = 0;
let llmDelayMs = 150;
let llmStreamAbortedByClient = false;
let llmStreamChunksSent = 0;

const VALID_GRAPH_JSON = JSON.stringify({
  nodes: [
    {
      id: 'index',
      label: 'Entry File',
      path: 'src/index.js',
      type: 'file',
      summary: 'Main entry point.',
    },
    {
      id: 'app',
      label: 'App Core',
      path: 'src/app.js',
      type: 'file',
      summary: 'Core app module.',
    },
  ],
  edges: [{ from: 'index', to: 'app' }],
});

// ── 1. Start mock Gemini OpenAI-compatible HTTP server ────────────────────────
const mockLlmServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', async () => {
      const parsed = JSON.parse(body || '{}');

      if (parsed.stream) {
        llmStreamAbortedByClient = false;
        llmStreamChunksSent = 0;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        let aborted = false;
        res.on('close', () => {
          aborted = true;
          if (!res.writableEnded) {
            llmStreamAbortedByClient = true;
          }
        });

        for (let i = 0; i < 40; i++) {
          if (aborted || res.destroyed) {
            llmStreamAbortedByClient = true;
            return;
          }
          llmStreamChunksSent++;
          res.write(
            `data: ${JSON.stringify({
              id: 'chatcmpl-mock',
              object: 'chat.completion.chunk',
              model: 'gemini-flash-lite-latest',
              choices: [{ index: 0, delta: { content: `token-${i} ` }, finish_reason: null }],
            })}\n\n`
          );
          await new Promise((r) => setTimeout(r, 40));
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      llmCallCount++;
      await new Promise((r) => setTimeout(r, llmDelayMs));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: VALID_GRAPH_JSON }, finish_reason: 'stop' }],
        })
      );
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

await new Promise((r) => mockLlmServer.listen(0, '127.0.0.1', r));
const mockLlmPort = mockLlmServer.address().port;
process.env.LLM_BASE_URL = `http://127.0.0.1:${mockLlmPort}/v1`;
process.env.LLM_API_KEY = 'mock-gemini-key';

// ── 2. Intercept GitHub fetches locally (forwarding mock LLM localhost traffic) ──
let slowGithubEnabled = false;
const originalFetch = global.fetch;

global.fetch = async (url, opts = {}) => {
  const strUrl = String(url);
  if (strUrl.startsWith(`http://127.0.0.1:${mockLlmPort}`)) {
    return originalFetch(url, opts);
  }

  if (strUrl.startsWith('https://api.github.com/repos/')) {
    if (slowGithubEnabled) {
      // Simulate stalled GitHub API until caller's AbortSignal fires (8 seconds)
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 15000);
        if (opts.signal) {
          opts.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              const abortErr = new Error('The operation was aborted due to timeout');
              abortErr.name = 'TimeoutError';
              reject(abortErr);
            },
            { once: true }
          );
        }
      });
    }

    if (strUrl.includes('/git/trees/')) {
      return new Response(
        JSON.stringify({
          truncated: false,
          tree: [
            { path: 'src/index.js', type: 'blob' },
            { path: 'src/app.js', type: 'blob' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (strUrl.endsWith('/readme')) {
      return new Response('# Mock Repo README', { status: 200 });
    }

    return new Response(
      JSON.stringify({ default_branch: 'main', description: 'Mock repo', private: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return originalFetch(url, opts);
};

// Dynamic imports after env vars & fetch interceptor are ready
const { createApp } = await import('../../app.js');
const { signSessionJwt, COOKIE_NAME } = await import('../../routes/auth.js');
const Diagram = (await import('../../models/Diagram.js')).default;

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const app = createApp();
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const loadUserJwt = signSessionJwt({
  id: 'github:loadtest',
  name: 'Load Tester',
  username: 'loadtest',
  email: 'load@test.dev',
  provider: 'github',
});
const authHeaders = {
  'Content-Type': 'application/json',
  Cookie: `${COOKIE_NAME}=${loadUserJwt}`,
};

try {
  // ── Test 1: 50 parallel requests for SAME repo -> 1 Gemini call ───────────
  console.log('\n[Load 1] 50 parallel requests for the same repo...');
  llmCallCount = 0;
  llmDelayMs = 200;

  const sameRepoResult = await autocannon({
    url: `${baseUrl}/api/diagram`,
    connections: 50,
    amount: 50,
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ owner: 'facebook', repo: 'singleflight-test' }),
  });

  console.log(
    `2xx responses: ${sameRepoResult['2xx']}, non-2xx: ${sameRepoResult.non2xx}, Gemini calls: ${llmCallCount}`
  );
  assert.strictEqual(sameRepoResult['2xx'], 50, 'All 50 parallel same-repo requests should succeed');
  assert.strictEqual(llmCallCount, 1, '50 parallel requests for same repo must trigger only 1 Gemini call');

  // ── Test 2: Full p-limit queue returns 503 ────────────────────────────────
  console.log('\n[Load 2] Queue saturation -> 503 responses...');
  llmCallCount = 0;
  llmDelayMs = 450; // Hold 2 concurrency + 2 queued slots busy (~450ms)

  let reqIdx = 0;
  const queueRequests = Array.from({ length: 12 }, () => {
    const id = ++reqIdx;
    return originalFetch(`${baseUrl}/api/diagram`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ owner: 'queueorg', repo: `repo-${id}` }),
    }).then((r) => r.status);
  });

  const queueStatuses = await Promise.all(queueRequests);
  const count200 = queueStatuses.filter((s) => s === 200).length;
  const count503 = queueStatuses.filter((s) => s === 503).length;
  console.log(`Queue burst statuses -> 200: ${count200}, 503: ${count503}, all: [${queueStatuses.join(', ')}]`);
  assert(count200 > 0, 'Expected queued requests up to limit to succeed');
  assert(count503 > 0, 'Expected requests beyond queue capacity to return 503');

  // ── Test 3: Slow GitHub response times out after 8 seconds ────────────────
  console.log('\n[Load 3] Slow GitHub response timeout check (expects ~8s -> 504)...');
  slowGithubEnabled = true;
  const tStart = Date.now();
  const slowRes = await originalFetch(`${baseUrl}/api/diagram`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ owner: 'sloworg', repo: 'hanging-repo' }),
  });
  const elapsedMs = Date.now() - tStart;
  slowGithubEnabled = false;
  console.log(`Slow GitHub status: ${slowRes.status} in ${elapsedMs}ms`);
  assert.strictEqual(slowRes.status, 504, 'Slow GitHub response must return 504');
  assert(elapsedMs >= 7800 && elapsedMs <= 9500, `Expected ~8000ms timeout, got ${elapsedMs}ms`);

  // ── Test 4: Client disconnect aborts LLM stream ───────────────────────────
  console.log('\n[Load 4] Client disconnect aborts upstream chat stream...');
  const chatAbort = new AbortController();
  const chatRes = await originalFetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      owner: 'facebook',
      repo: 'singleflight-test',
      messages: [{ role: 'user', content: 'Stream something long' }],
    }),
    signal: chatAbort.signal,
  });
  console.log('[Load 4] chatRes status:', chatRes.status);
  assert.strictEqual(chatRes.status, 200);

  const reader = chatRes.body.getReader();
  const c1 = await reader.read(); // Read first SSE chunk
  console.log('[Load 4] read chunk 1:', new TextDecoder().decode(c1.value).trim());
  const c2 = await reader.read(); // Read second chunk
  console.log('[Load 4] read chunk 2:', new TextDecoder().decode(c2.value).trim());
  chatAbort.abort(); // Client disconnects mid-stream
  await reader.cancel().catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  console.log(`Upstream chunks sent before abort: ${llmStreamChunksSent}/40, aborted=${llmStreamAbortedByClient}`);
  assert(llmStreamAbortedByClient, 'Expected upstream Gemini stream to abort on client disconnect');
  assert(llmStreamChunksSent < 20, 'Stream continued too long after disconnect');

  // ── Test 5: Sustained autocannon throughput & flat memory check ───────────
  console.log('\n[Load 5] Sustained cache-hit autocannon load & memory stability check...');
  llmDelayMs = 10;
  // Warm cache first
  await originalFetch(`${baseUrl}/api/diagram`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ owner: 'memorg', repo: 'cached-repo' }),
  });

  global.gc?.();
  const heapBeforeMb = process.memoryUsage().heapUsed / (1024 * 1024);

  const memRun = await autocannon({
    url: `${baseUrl}/api/diagram`,
    connections: 25,
    amount: 500,
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ owner: 'memorg', repo: 'cached-repo' }),
  });

  await new Promise((r) => setTimeout(r, 150));
  global.gc?.();
  const heapAfterMb = process.memoryUsage().heapUsed / (1024 * 1024);
  const deltaMb = heapAfterMb - heapBeforeMb;

  console.log(
    `500 cached reqs: 2xx=${memRun['2xx']}, req/sec avg=${memRun.requests.average}, heap before=${heapBeforeMb.toFixed(1)}MB, after=${heapAfterMb.toFixed(1)}MB (delta=${deltaMb.toFixed(1)}MB)`
  );
  assert.strictEqual(memRun['2xx'], 500);
  assert(deltaMb < 50, `Heap grew too much (${deltaMb.toFixed(1)}MB)`);

  console.log('\nALL LOAD, QUEUE BACKPRESSURE, TIMEOUT, STREAM ABORT & MEMORY CHECKS PASSED.');
} finally {
  server.close();
  mockLlmServer.close();
  await mongoose.disconnect();
  await mongod.stop();
}
