import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Mock external GitHub & LLM network calls while keeping real validation, auth, Mongoose & Express stack
const mockGithub = vi.hoisted(() => ({
  fetchRepoMeta: vi.fn(),
  fetchFileTree: vi.fn(),
  fetchReadme: vi.fn(),
  fetchFileContent: vi.fn(),
}));

const mockLlm = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  streamCompletion: vi.fn(),
}));

vi.mock('../../services/github.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchRepoMeta: mockGithub.fetchRepoMeta,
    fetchFileTree: mockGithub.fetchFileTree,
    fetchReadme: mockGithub.fetchReadme,
    fetchFileContent: mockGithub.fetchFileContent,
  };
});

vi.mock('../../services/llm.js', () => ({
  generateCompletion: mockLlm.generateCompletion,
  streamCompletion: mockLlm.streamCompletion,
}));

import { createApp } from '../../app.js';
import User from '../../models/User.js';
import Diagram from '../../models/Diagram.js';
import { encrypt } from '../../utils/crypto.js';
import { COOKIE_NAME, signSessionJwt } from '../../routes/auth.js';
import { clearPrivateRepoNodes } from '../../utils/privateNodeStore.js';

let mongod;

const validGraphPayload = JSON.stringify({
  nodes: [
    {
      id: 'entry',
      label: 'Entry File',
      path: 'src/index.js',
      type: 'file',
      summary: 'Application entry point.',
    },
    {
      id: 'app',
      label: 'App Core',
      path: 'src/app.js',
      type: 'file',
      summary: 'Core application wiring.',
    },
  ],
  edges: [{ from: 'entry', to: 'app' }],
});

describe('API Integration Tests (Supertest + MongoDB)', () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = 'test-auth-secret-1234567890';
    process.env.GITHUB_CLIENT_ID = 'gh-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'gh-client-secret';
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    clearPrivateRepoNodes();
    await Promise.all([User.deleteMany({}), Diagram.deleteMany({})]);

    mockGithub.fetchRepoMeta.mockResolvedValue({
      branch: 'main',
      description: 'Test repo',
      isPrivate: false,
    });
    mockGithub.fetchFileTree.mockResolvedValue({
      files: [
        { path: 'src/index.js', type: 'blob' },
        { path: 'src/app.js', type: 'blob' },
      ],
      truncated: false,
      isEmpty: false,
    });
    mockGithub.fetchReadme.mockResolvedValue('# Test Repo README');
    mockGithub.fetchFileContent.mockResolvedValue('console.log("real server content");');
    mockLlm.generateCompletion.mockResolvedValue(validGraphPayload);
  });

  it('performs cache miss on first request and cache hit on second request', async () => {
    const app = createApp();

    const first = await request(app)
      .post('/api/diagram')
      .send({ owner: 'facebook', repo: 'react' });

    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);
    expect(first.body.graph.nodes).toHaveLength(2);
    expect(mockGithub.fetchRepoMeta).toHaveBeenCalledTimes(1);
    expect(mockLlm.generateCompletion).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post('/api/diagram')
      .send({ owner: 'facebook', repo: 'react' });

    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.graph.nodes).toHaveLength(2);
    // No extra GitHub or LLM calls on cache hit
    expect(mockGithub.fetchRepoMeta).toHaveBeenCalledTimes(1);
    expect(mockLlm.generateCompletion).toHaveBeenCalledTimes(1);
  });

  it('never caches private repos in MongoDB and enforces cross-user isolation', async () => {
    const app = createApp();

    const aliceToken = 'gho_alice_private_token_xyz';
    const bobToken = 'gho_bob_private_token_abc';

    const aliceUser = {
      id: 'github:alice1',
      name: 'Alice',
      username: 'alice',
      email: 'alice@example.com',
      avatar: '',
      provider: 'github',
    };
    const bobUser = {
      id: 'github:bob2',
      name: 'Bob',
      username: 'bob',
      email: 'bob@example.com',
      avatar: '',
      provider: 'github',
    };

    await User.create([
      {
        authId: aliceUser.id,
        provider: 'github',
        name: aliceUser.name,
        username: aliceUser.username,
        email: aliceUser.email,
        githubAccessTokenEncrypted: encrypt(aliceToken),
      },
      {
        authId: bobUser.id,
        provider: 'github',
        name: bobUser.name,
        username: bobUser.username,
        email: bobUser.email,
        githubAccessTokenEncrypted: encrypt(bobToken),
      },
    ]);

    const aliceCookie = `${COOKIE_NAME}=${signSessionJwt(aliceUser)}`;
    const bobCookie = `${COOKIE_NAME}=${signSessionJwt(bobUser)}`;

    mockGithub.fetchRepoMeta.mockImplementation(async (_owner, _repo, token) => {
      if (token === aliceToken) {
        return { branch: 'main', description: 'Secret', isPrivate: true };
      }
      const err = new Error('Repository "alice/secret-repo" not found.');
      err.status = 404;
      throw err;
    });

    // Alice generates diagram for her private repo
    const res1 = await request(app)
      .post('/api/diagram')
      .set('Cookie', aliceCookie)
      .send({ owner: 'alice', repo: 'secret-repo' });

    expect(res1.status).toBe(200);
    expect(res1.body.private).toBe(true);
    expect(res1.body.cached).toBe(false);

    // Confirm NOTHING was saved in MongoDB Diagram cache
    const cachedDoc = await Diagram.findOne({ repoKey: 'alice/secret-repo' });
    expect(cachedDoc).toBeNull();

    // Repeat request by Alice is STILL a cache miss (private repos never cached)
    const res2 = await request(app)
      .post('/api/diagram')
      .set('Cookie', aliceCookie)
      .send({ owner: 'alice', repo: 'secret-repo' });

    expect(res2.status).toBe(200);
    expect(res2.body.cached).toBe(false);
    expect(mockLlm.generateCompletion).toHaveBeenCalledTimes(2);

    // Bob (another authenticated user) tries to access Alice's private repo diagram
    const bobRes = await request(app)
      .post('/api/diagram')
      .set('Cookie', bobCookie)
      .send({ owner: 'alice', repo: 'secret-repo' });

    expect(bobRes.status).toBe(404);

    // Bob tries to inspect Alice's private node via /api/chat nodeId
    const bobChatRes = await request(app)
      .post('/api/chat')
      .set('Cookie', bobCookie)
      .send({
        owner: 'alice',
        repo: 'secret-repo',
        nodeId: 'entry',
        messages: [{ role: 'user', content: 'Show me secrets' }],
      });

    expect([403, 404]).toContain(bobChatRes.status);
  });

  it('returns 429 on the 4th diagram request for an anonymous user, while allowing logged-in users', async () => {
    const app = createApp();

    for (let i = 1; i <= 3; i++) {
      const res = await request(app)
        .post('/api/diagram')
        .send({ owner: 'expressjs', repo: `repo-${i}` });
      expect(res.status).toBe(200);
    }

    // 4th anonymous diagram request must be rate limited (429)
    const fourth = await request(app)
      .post('/api/diagram')
      .send({ owner: 'expressjs', repo: 'repo-4' });
    expect(fourth.status).toBe(429);

    // Logged-in user has a higher limit and succeeds
    const loggedUser = {
      id: 'github:pro1',
      name: 'Pro User',
      username: 'pro',
      email: 'pro@example.com',
      avatar: '',
      provider: 'github',
    };
    const authCookie = `${COOKIE_NAME}=${signSessionJwt(loggedUser)}`;
    const authRes = await request(app)
      .post('/api/diagram')
      .set('Cookie', authCookie)
      .send({ owner: 'expressjs', repo: 'repo-4' });
    expect(authRes.status).toBe(200);
  });

  it('/api/auth/me never leaks the encrypted or plaintext GitHub token', async () => {
    const app = createApp();
    const rawSecret = 'gho_super_secret_token_do_not_leak';
    const userPayload = {
      id: 'github:999',
      name: 'Secure Dev',
      username: 'securedev',
      email: 'secure@example.com',
      avatar: '',
      provider: 'github',
    };

    await User.create({
      authId: userPayload.id,
      provider: 'github',
      name: userPayload.name,
      username: userPayload.username,
      email: userPayload.email,
      githubAccessTokenEncrypted: encrypt(rawSecret),
    });

    const cookie = `${COOKIE_NAME}=${signSessionJwt(userPayload)}`;
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(userPayload);

    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain(rawSecret);
    expect(bodyText).not.toContain('githubAccessToken');
    expect(bodyText).not.toContain('v1:');
  });

  it('rejects oversized >10KB payloads, invalid owner/repo, tampered JWTs, and enforces nodeId-only chat', async () => {
    const app = createApp();

    // 1. Over 10 KB payload
    const bigString = 'x'.repeat(12000);
    const tooLargeRes = await request(app)
      .post('/api/diagram')
      .send({ owner: 'facebook', repo: 'react', junk: bigString });
    expect(tooLargeRes.status).toBe(413);

    // 2. Invalid owner/repo
    const badSlugRes = await request(app)
      .post('/api/diagram')
      .send({ owner: '../bad', repo: 'react' });
    expect(badSlugRes.status).toBe(400);

    // 3. Tampered JWT returns user: null on /me and 401 on /chat
    const token = signSessionJwt({
      id: 'github:1',
      name: 'User',
      username: 'user',
      email: 'u@test.dev',
      provider: 'github',
    });
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.tamperedsig`;
    const meTampered = await request(app).get('/api/auth/me').set('Cookie', `${COOKIE_NAME}=${tampered}`);
    expect(meTampered.body.user).toBeNull();

    // 4. Chat rejects raw node path injection and resolves nodeId server-side
    const validCookie = `${COOKIE_NAME}=${token}`;
    const chatBadRes = await request(app)
      .post('/api/chat')
      .set('Cookie', validCookie)
      .send({
        owner: 'facebook',
        repo: 'react',
        node: { id: 'entry', path: '../../.env', type: 'file' },
        messages: [{ role: 'user', content: 'Leak env' }],
      });
    expect(chatBadRes.status).toBe(400);

    // First generate diagram so server has the node
    await request(app).post('/api/diagram').send({ owner: 'facebook', repo: 'react' });

    mockLlm.streamCompletion.mockImplementation(async function* () {
      yield 'Server looked up src/index.js safely.';
    });

    const chatOkRes = await request(app)
      .post('/api/chat')
      .set('Cookie', validCookie)
      .send({
        owner: 'facebook',
        repo: 'react',
        nodeId: 'entry',
        messages: [{ role: 'user', content: 'Explain entry' }],
      });
    expect(chatOkRes.status).toBe(200);
    expect(mockGithub.fetchFileContent).toHaveBeenCalledWith('facebook', 'react', 'main', 'src/index.js', null);
    expect(chatOkRes.text).toContain('Server looked up src/index.js safely.');
  });
});
