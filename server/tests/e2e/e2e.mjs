import http from 'http';
import assert from 'assert';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from '../../../client/node_modules/vite/dist/node/index.js';
import { chromium } from '../../../client/node_modules/playwright/index.mjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(__dirname, '../../../client');

// Configure E2E server environment before importing app modules
process.env.AUTH_SECRET = 'e2e-test-auth-secret';
process.env.AUTH_DIAGRAM_RATE_LIMIT = '200';
process.env.ANON_DIAGRAM_RATE_LIMIT = '50';
process.env.GITHUB_CLIENT_ID = '';
process.env.GITHUB_CLIENT_SECRET = '';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';

const ALICE_GH_TOKEN = 'gho_e2e_alice_private_token';

const MOCK_REPOS = {
  'octocat/small-app': {
    meta: { default_branch: 'main', description: 'Small starter app', private: false },
    tree: {
      truncated: false,
      tree: [
        { path: 'package.json', type: 'blob' },
        { path: 'src/index.js', type: 'blob' },
        { path: 'src/controllers', type: 'tree' },
      ],
    },
    graph: {
      nodes: [
        { id: 'pkg', label: 'Manifest', path: 'package.json', type: 'file', summary: 'Package config.' },
        { id: 'entry', label: 'Entry Script', path: 'src/index.js', type: 'file', summary: 'Starts the app.' },
        { id: 'ctrl', label: 'Controllers Dir', path: 'src/controllers', type: 'folder', summary: 'Route controllers.' },
      ],
      edges: [
        { from: 'pkg', to: 'entry' },
        { from: 'entry', to: 'ctrl' },
      ],
    },
  },
  'vercel/big-repo': {
    meta: { default_branch: 'canary', description: 'Large repo', private: false },
    tree: {
      truncated: true,
      tree: [
        { path: 'README.md', type: 'blob' },
        { path: 'packages/core/index.ts', type: 'blob' },
      ],
    },
    graph: {
      nodes: [
        { id: 'readme', label: 'Docs', path: 'README.md', type: 'file', summary: 'Repo overview.' },
        { id: 'core', label: 'Core Engine', path: 'packages/core/index.ts', type: 'file', summary: 'Core package.' },
      ],
      edges: [{ from: 'readme', to: 'core' }],
    },
  },
  'acme/monorepo': {
    meta: { default_branch: 'main', description: 'Workspace monorepo', private: false },
    tree: {
      truncated: false,
      tree: [
        { path: 'apps/web', type: 'tree' },
        { path: 'apps/web/src/App.tsx', type: 'blob' },
        { path: 'packages/ui', type: 'tree' },
        { path: 'packages/ui/Button.tsx', type: 'blob' },
      ],
    },
    graph: {
      nodes: [
        { id: 'web-dir', label: 'Web App', path: 'apps/web', type: 'folder', summary: 'Frontend workspace.' },
        { id: 'web-app', label: 'App Shell', path: 'apps/web/src/App.tsx', type: 'file', summary: 'Root UI.' },
        { id: 'ui-dir', label: 'UI Package', path: 'packages/ui', type: 'folder', summary: 'Shared components.' },
        { id: 'btn', label: 'Button UI', path: 'packages/ui/Button.tsx', type: 'file', summary: 'Reusable button.' },
      ],
      edges: [
        { from: 'web-dir', to: 'web-app' },
        { from: 'ui-dir', to: 'btn' },
        { from: 'btn', to: 'web-app' },
      ],
    },
  },
  'octocat/empty-repo': {
    meta: { default_branch: 'main', description: 'Empty repo', private: false },
    empty: true,
  },
  'alice/secret-repo': {
    meta: { default_branch: 'main', description: 'Private repo', private: true },
    tree: {
      truncated: false,
      tree: [{ path: 'secret.js', type: 'blob' }],
    },
    graph: {
      nodes: [
        { id: 'sec', label: 'Secret Module', path: 'secret.js', type: 'file', summary: 'Confidential code.' },
      ],
      edges: [],
    },
  },
};

const mockLlmServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      const userText = JSON.stringify(parsed.messages || []);

      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        const reply = 'This component handles initialization safely. <script>window.__xss=true</script>';
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-e2e',
            object: 'chat.completion.chunk',
            model: 'gemini-flash-lite-latest',
            choices: [{ index: 0, delta: { content: reply }, finish_reason: 'stop' }],
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      let matchedGraph = MOCK_REPOS['octocat/small-app'].graph;
      for (const [key, cfg] of Object.entries(MOCK_REPOS)) {
        if (userText.includes(key) && cfg.graph) {
          matchedGraph = cfg.graph;
          break;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-e2e',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(matchedGraph) }, finish_reason: 'stop' }],
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
process.env.LLM_API_KEY = 'e2e-mock-key';

const originalFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const s = String(url);
  if (s.startsWith(`http://127.0.0.1:${mockLlmPort}`)) {
    return originalFetch(url, opts);
  }

  if (s.startsWith('https://api.github.com/repos/')) {
    await new Promise((r) => setTimeout(r, 350));
    const m = s.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/?]+)/);
    const key = m ? `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}` : '';
    const mock = MOCK_REPOS[key];
    if (!mock) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }
    if (s.includes('/git/trees/')) {
      if (mock.empty) {
        return new Response(JSON.stringify({ message: 'Git Repository is empty.' }), { status: 409 });
      }
      return new Response(JSON.stringify(mock.tree), { status: 200 });
    }
    if (s.endsWith('/readme')) {
      return new Response(`# ${key}`, { status: 200 });
    }
    return new Response(JSON.stringify(mock.meta), { status: 200 });
  }

  if (s.startsWith('https://raw.githubusercontent.com/')) {
    return new Response('export function init() { return true; }', { status: 200 });
  }

  return originalFetch(url, opts);
};

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const { createApp } = await import('../../app.js');
const User = (await import('../../models/User.js')).default;
const { encrypt } = await import('../../utils/crypto.js');
const { COOKIE_NAME, signSessionJwt } = await import('../../routes/auth.js');

const app = createApp();
const apiServer = http.createServer(app);
await new Promise((r) => apiServer.listen(0, '127.0.0.1', r));
const apiPort = apiServer.address().port;

process.chdir(clientRoot);
const viteServer = await createViteServer({
  root: clientRoot,
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
    hmr: false,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
await viteServer.listen();
const viteAddr = viteServer.httpServer.address();
const frontendUrl = `http://127.0.0.1:${viteAddr.port}`;
console.log('Vite listening at', frontendUrl);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.error('[Browser pageerror]', err.message));
  page.on('requestfailed', (req) => console.error('[Request failed]', req.url(), req.failure()?.errorText));

  console.log('1. Home page & repo submission -> Loading state -> Small Repo Diagram...');
  await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForSelector('h1:has-text("DevDiagram")', { timeout: 10000 });
  await page.fill('#repo-url-input', 'https://github.com/octocat/small-app');
  const loadingWait = page.waitForSelector('text=Analysing repository…', { timeout: 5000 });
  await page.click('#generate-btn');
  await loadingWait;
  await page.waitForSelector('text=Rising Stairs Architecture', { timeout: 15000 });

  console.log('2. Checking GitHub blob/tree links for file vs folder nodes...');
  await page.click('text=Entry Script');
  const fileHref = await page.getAttribute('a:has-text("Open File on GitHub")', 'href');
  assert.strictEqual(fileHref, 'https://github.com/octocat/small-app/blob/main/src/index.js');

  // Close the detail drawer before clicking the next card underneath it
  await page.click('button:has-text("✕")');

  await page.click('text=Controllers Dir');
  const folderHref = await page.getAttribute('a:has-text("Open Folder on GitHub")', 'href');
  assert.strictEqual(folderHref, 'https://github.com/octocat/small-app/tree/main/src/controllers');

  console.log('3. Guest chat gated -> Login -> AI Chat streaming + XSS check -> Logout...');
  await page.waitForSelector('text=Sign in to use AI Chat');
  await page.click('#chat-signin-btn');
  await page.waitForSelector('#login-card-title');
  await page.click('#github-login-btn');
  await page.waitForSelector('#demo-login-btn');
  await page.click('#demo-login-btn');

  await page.waitForSelector('text=GitHub Demo User', { timeout: 5000 });
  await page.waitForSelector('#history-toggle-btn');

  const chatInput = page.locator('input[placeholder*="Ask"]');
  await chatInput.fill('What does this controller do?');
  await chatInput.press('Enter');
  await page.waitForSelector('text=This component handles initialization safely.', { timeout: 10000 });
  const xssRan = await page.evaluate(() => Boolean(window.__xss));
  assert.strictEqual(xssRan, false, 'Raw HTML script in markdown must not execute');

  await page.click('#logout-btn');
  await page.waitForSelector('text=Sign in to use AI Chat');
  await page.waitForSelector('#open-login-btn');

  console.log('4. Testing Large (truncated), Monorepo, Empty, Private (guest vs owner), and 404 repos...');
  await page.goto(`${frontendUrl}/vercel/big-repo`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Large repo — truncated', { timeout: 10000 });

  await page.goto(`${frontendUrl}/acme/monorepo`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Web App', { timeout: 10000 });
  await page.waitForSelector('text=UI Package');

  await page.goto(`${frontendUrl}/octocat/empty-repo`, { waitUntil: 'networkidle' });
  await page.waitForSelector("text=Couldn't draw the map", { timeout: 10000 });
  await page.waitForSelector('text=empty');

  // Unauthenticated private repo fails with error state
  await page.goto(`${frontendUrl}/alice/secret-repo`, { waitUntil: 'networkidle' });
  await page.waitForSelector("text=Couldn't draw the map", { timeout: 10000 });
  await page.waitForSelector('text=private');

  // Authorized owner with encrypted GitHub token can view their private repo
  const aliceUser = {
    id: 'github:alice-e2e',
    name: 'Alice E2E',
    username: 'alice',
    email: 'alice@e2e.dev',
    avatar: '',
    provider: 'github',
  };
  await User.create({
    authId: aliceUser.id,
    provider: 'github',
    name: aliceUser.name,
    username: aliceUser.username,
    email: aliceUser.email,
    githubAccessTokenEncrypted: encrypt(ALICE_GH_TOKEN),
  });
  const aliceJwt = signSessionJwt(aliceUser);
  const aliceContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await aliceContext.addCookies([
    {
      name: COOKIE_NAME,
      value: aliceJwt,
      url: frontendUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const alicePage = await aliceContext.newPage();
  await alicePage.goto(`${frontendUrl}/alice/secret-repo`, { waitUntil: 'networkidle' });
  await alicePage.waitForSelector('text=Secret Module', { timeout: 10000 });
  await aliceContext.close();

  await page.goto(`${frontendUrl}/octocat/does-not-exist`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=uh-oh! Nothing here...', { timeout: 10000 });

  console.log('5. Testing Mobile Layout (375x812)...');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(frontendUrl, { waitUntil: 'networkidle' });
  const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.strictEqual(homeOverflow, false, 'Mobile home page should not horizontally overflow');

  await page.goto(`${frontendUrl}/octocat/small-app`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Rising Stairs Architecture', { timeout: 10000 });
  const mobileMetrics = await page.evaluate(() => {
    const svg = document.querySelector('svg[viewBox]');
    const chatHeader = Array.from(document.querySelectorAll('span')).find((el) =>
      el.textContent?.includes('AI Code Assistant')
    );
    return {
      scrollOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      svgHeight: svg?.getBoundingClientRect().height || 0,
      chatVisible: Boolean(chatHeader && chatHeader.getBoundingClientRect().height > 0),
    };
  });
  console.log('Mobile metrics:', mobileMetrics);
  assert.strictEqual(mobileMetrics.scrollOverflow, false, 'Mobile diagram page must not horizontally overflow');
  assert(mobileMetrics.svgHeight > 180, 'Diagram SVG canvas must have substantial height on mobile');
  assert.strictEqual(mobileMetrics.chatVisible, true, 'Chat panel must be visible on mobile');

  console.log('\nALL PLAYWRIGHT E2E & MANUAL UI CHECKLIST ITEMS PASSED.');
} finally {
  await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
  viteServer.httpServer?.closeAllConnections?.();
  await viteServer.close().catch(() => {});
  apiServer.closeAllConnections?.();
  apiServer.close();
  mockLlmServer.closeAllConnections?.();
  mockLlmServer.close();
  await mongoose.disconnect().catch(() => {});
  await mongod.stop().catch(() => {});
}
process.exit(0);
