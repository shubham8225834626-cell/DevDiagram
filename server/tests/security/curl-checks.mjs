import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import assert from 'assert';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../app.js';

const execFileAsync = promisify(execFile);

process.env.AUTH_SECRET = 'curl-security-test-secret';
process.env.GITHUB_CLIENT_ID = 'test-gh-id';
process.env.GITHUB_CLIENT_SECRET = 'test-gh-secret';
process.env.TRUST_PROXY = 'true';

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const app = createApp();
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const curl = async (...args) => {
  const { stdout } = await execFileAsync('curl.exe', ['-sS', ...args], {
    encoding: 'utf8',
    timeout: 10000,
  });
  return stdout;
};

try {
  console.log('=== 1. Cookie Flags (HttpOnly, Secure, SameSite) ===');
  const loginResp = await curl(
    '-i',
    '-X',
    'POST',
    `${base}/api/auth/demo`,
    '-H',
    'Content-Type: application/json',
    '-H',
    'X-Forwarded-Proto: https',
    '-d',
    '{"provider":"github"}'
  );
  const setCookieLine = loginResp.split(/\r?\n/).find((l) => /^set-cookie:/i.test(l));
  console.log(setCookieLine);
  assert(setCookieLine?.includes('HttpOnly'), 'Missing HttpOnly flag');
  assert(setCookieLine?.includes('Secure'), 'Missing Secure flag');
  assert(setCookieLine?.includes('SameSite=Lax'), 'Missing SameSite=Lax flag');

  const tokenMatch = setCookieLine?.match(/devdiagram_session=([^;]+)/);
  const jwtToken = tokenMatch?.[1] || '';

  console.log('\n=== 2. OAuth State Parameter ===');
  const oauthInit = await curl('-i', `${base}/api/auth/github`);
  const oauthLines = oauthInit.split(/\r?\n/).filter((l) => /^(HTTP\/|location:|set-cookie:)/i.test(l));
  console.log(oauthLines.join('\n'));
  assert(oauthInit.includes('state='), 'Missing OAuth state in redirect');
  assert(oauthInit.includes('devdiagram_oauth_state='), 'Missing OAuth state cookie');

  const oauthBadCb = await curl('-i', `${base}/api/auth/github/callback?code=abc&state=tampered`);
  const badCbLines = oauthBadCb
    .split(/\r?\n/)
    .filter((l) => /^(HTTP\/|location:|set-cookie:)/i.test(l));
  console.log('Bad callback:', badCbLines.join(' | '));
  assert(oauthBadCb.includes('auth_error=invalid_state'), 'Tampered OAuth state was not rejected');

  console.log('\n=== 3. Tampered JWT ===');
  const parts = jwtToken.split('.');
  const tamperedJwt = `${parts[0]}.${parts[1]}.INVALID_SIGNATURE`;
  const validMe = await curl('-H', `Cookie: devdiagram_session=${jwtToken}`, `${base}/api/auth/me`);
  const tamperedMe = await curl('-H', `Cookie: devdiagram_session=${tamperedJwt}`, `${base}/api/auth/me`);
  const tamperedChatStatus = await curl(
    '-o',
    'NUL',
    '-w',
    '%{http_code}',
    '-X',
    'POST',
    '-H',
    `Cookie: devdiagram_session=${tamperedJwt}`,
    '-H',
    'Content-Type: application/json',
    '-d',
    '{}',
    `${base}/api/chat`
  );
  console.log('Valid /me:', validMe);
  console.log('Tampered /me:', tamperedMe);
  console.log('Tampered /chat HTTP status:', tamperedChatStatus);
  assert(JSON.parse(tamperedMe).user === null, 'Tampered JWT accepted on /me');
  assert(tamperedChatStatus === '401', 'Tampered JWT not rejected with 401 on /chat');

  console.log('\n=== 4. CORS & Helmet Headers ===');
  const allowedOriginResp = await curl('-i', '-H', 'Origin: http://localhost:5173', `${base}/api/health`);
  console.log('--- Allowed Origin Headers ---');
  console.log(allowedOriginResp.split(/\r?\n\r?\n/)[0]);
  assert(allowedOriginResp.includes('Access-Control-Allow-Origin: http://localhost:5173'));
  assert(allowedOriginResp.includes('X-Content-Type-Options: nosniff'));
  assert(allowedOriginResp.includes('Content-Security-Policy:'));

  const blockedOriginResp = await curl('-i', '-H', 'Origin: https://evil.attacker.com', `${base}/api/health`);
  console.log('--- Blocked Origin Headers ---');
  console.log(blockedOriginResp.split(/\r?\n/).slice(0, 8).join('\n'));
  assert(blockedOriginResp.startsWith('HTTP/1.1 403'));
  assert(!blockedOriginResp.includes('Access-Control-Allow-Origin'));

  console.log('\nALL CURL SECURITY CHECKS PASSED.');
} finally {
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
}
