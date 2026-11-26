import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import User from '../models/User.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const router = Router();

export const COOKIE_NAME = 'devdiagram_session';
export const STATE_COOKIE = 'devdiagram_oauth_state';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export function getJwtSecret() {
  return process.env.AUTH_SECRET || process.env.LLM_API_KEY || 'devdiagram-local-secret';
}

export function signSessionJwt(user) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      username: user.username || '',
      email: user.email || '',
      avatar: user.avatar || '',
      provider: user.provider,
    },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn: SESSION_MAX_AGE_SEC,
      issuer: 'devdiagram',
      audience: 'devdiagram-web',
    }
  );
}

export function verifySessionJwt(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'devdiagram',
      audience: 'devdiagram-web',
    });
    if (!decoded || typeof decoded !== 'object' || !decoded.sub) return null;
    return {
      id: decoded.sub,
      name: decoded.name || 'User',
      username: decoded.username || '',
      email: decoded.email || '',
      avatar: decoded.avatar || '',
      provider: decoded.provider || 'github',
    };
  } catch {
    return null;
  }
}

function signStateToken(payloadObj) {
  return jwt.sign(payloadObj, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '10m',
    issuer: 'devdiagram-oauth-state',
  });
}

function verifyStateToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'devdiagram-oauth-state',
    });
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      cookies[k] = decodeURIComponent(v);
    } catch {
      cookies[k] = v;
    }
  }
  return cookies;
}

function shouldUseSecureCookie(req) {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE === 'true' ||
    Boolean(req?.secure) ||
    req?.headers?.['x-forwarded-proto'] === 'https'
  );
}

function cookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(req),
    maxAge,
    path: '/',
  };
}

function setSessionCookie(req, res, user) {
  const token = signSessionJwt(user);
  res.cookie(COOKIE_NAME, token, cookieOptions(req, SESSION_MAX_AGE_MS));
}

function getBaseUrl(req) {
  return process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
}

function sanitizeReturnTo(raw) {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/';
}

// ── GET /api/auth/providers ───────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  });
});

// ── Helper for other routes ───────────────────────────────────────────────────
export function getSessionUser(req) {
  const cookies = parseCookies(req);
  return verifySessionJwt(cookies[COOKIE_NAME]);
}

/**
 * Retrieve and decrypt the authenticated user's GitHub OAuth access token from DB.
 * Never exposed in HTTP responses.
 */
export async function getUserGithubToken(sessionUser) {
  if (!sessionUser?.id) return null;
  try {
    const userDoc = await User.findOne({ authId: sessionUser.id })
      .select('+githubAccessTokenEncrypted')
      .lean();
    if (!userDoc?.githubAccessTokenEncrypted) return null;
    return decrypt(userDoc.githubAccessTokenEncrypted);
  } catch {
    return null;
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.json({ user: null });

  try {
    const fallbackUsername =
      sessionUser.username ||
      (sessionUser.email ? sessionUser.email.split('@')[0] : '') ||
      sessionUser.name ||
      '';

    // Explicitly select only safe public fields (never select githubAccessTokenEncrypted)
    const userDoc = await User.findOneAndUpdate(
      { authId: sessionUser.id },
      {
        $setOnInsert: {
          authId: sessionUser.id,
          provider: sessionUser.provider || 'github',
          name: sessionUser.name || 'User',
          username: fallbackUsername,
          email: sessionUser.email || '',
          avatar: sessionUser.avatar || '',
          lastLoginAt: new Date(),
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    )
      .select('authId name username email avatar provider')
      .lean();

    return res.json({
      user: {
        id: sessionUser.id,
        name: userDoc.name,
        username: userDoc.username,
        email: userDoc.email,
        avatar: userDoc.avatar,
        provider: userDoc.provider,
      },
    });
  } catch (err) {
    console.warn('[Auth /me] DB sync warning:', err.message);
    return res.json({
      user: {
        id: sessionUser.id,
        name: sessionUser.name,
        username: sessionUser.username,
        email: sessionUser.email,
        avatar: sessionUser.avatar,
        provider: sessionUser.provider,
      },
    });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(req),
    path: '/',
  });
  res.json({ ok: true });
});

async function upsertUserRecord(user, githubAccessToken = null) {
  try {
    const encryptedToken = githubAccessToken ? encrypt(githubAccessToken) : null;
    await User.findOneAndUpdate(
      { authId: user.id },
      {
        $set: {
          provider: user.provider,
          name: user.name,
          username: user.username || '',
          email: user.email || '',
          avatar: user.avatar || '',
          lastLoginAt: new Date(),
          ...(encryptedToken ? { githubAccessTokenEncrypted: encryptedToken } : {}),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Auth] Failed to persist user:', err.message);
  }
}

// ── POST /api/auth/demo (disabled in production) ──────────────────────────────
router.post('/demo', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const provider = req.body?.provider === 'google' ? 'google' : 'github';
  const user = {
    id: `demo-${provider}`,
    name: provider === 'google' ? 'Google Demo User' : 'GitHub Demo User',
    username: `demo_${provider}`,
    email: 'demo@devdiagram.local',
    avatar: '',
    provider,
  };
  await upsertUserRecord(user);
  setSessionCookie(req, res, user);
  res.json({ user });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({ error: 'Google OAuth is not configured on the server.' });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const state = signStateToken({
    nonce: crypto.randomBytes(16).toString('hex'),
    returnTo,
  });
  res.cookie(STATE_COOKIE, state, cookieOptions(req, 600000));

  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookies = parseCookies(req);
  const cookieState = cookies[STATE_COOKIE];
  const savedState = verifyStateToken(cookieState);
  res.clearCookie(STATE_COOKIE, { path: '/' });

  if (
    typeof code !== 'string' ||
    typeof state !== 'string' ||
    typeof cookieState !== 'string' ||
    !savedState ||
    state.length !== cookieState.length ||
    !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
  ) {
    return res.redirect('/?auth_error=invalid_state');
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userRes.json();

    const user = {
      id: `google:${profile.id}`,
      name: profile.name || profile.email,
      username: profile.email ? profile.email.split('@')[0] : '',
      email: profile.email || '',
      avatar: profile.picture || '',
      provider: 'google',
    };
    await upsertUserRecord(user);
    setSessionCookie(req, res, user);

    return res.redirect(sanitizeReturnTo(savedState.returnTo));
  } catch (err) {
    console.error('[Auth Google]', err.message);
    return res.redirect('/?auth_error=google_failed');
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────
router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    return res.status(501).json({ error: 'GitHub OAuth is not configured on the server.' });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const state = signStateToken({
    nonce: crypto.randomBytes(16).toString('hex'),
    returnTo,
  });
  res.cookie(STATE_COOKIE, state, cookieOptions(req, 600000));

  const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email repo',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookies = parseCookies(req);
  const cookieState = cookies[STATE_COOKIE];
  const savedState = verifyStateToken(cookieState);
  res.clearCookie(STATE_COOKIE, { path: '/' });

  if (
    typeof code !== 'string' ||
    typeof state !== 'string' ||
    typeof cookieState !== 'string' ||
    !savedState ||
    state.length !== cookieState.length ||
    !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
  ) {
    return res.redirect('/?auth_error=invalid_state');
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DevDiagram-App',
      },
    });
    const profile = await userRes.json();

    let email = profile.email || '';
    if (!email) {
      try {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'DevDiagram-App',
          },
        });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
          email = primary?.email || '';
        }
      } catch {
        // email remains ''
      }
    }

    const user = {
      id: `github:${profile.id}`,
      name: profile.name || profile.login,
      username: profile.login || '',
      email,
      avatar: profile.avatar_url || '',
      provider: 'github',
    };
    await upsertUserRecord(user, tokenData.access_token);
    setSessionCookie(req, res, user);

    return res.redirect(sanitizeReturnTo(savedState.returnTo));
  } catch (err) {
    console.error('[Auth GitHub]', err.message);
    return res.redirect('/?auth_error=github_failed');
  }
});

export default router;
