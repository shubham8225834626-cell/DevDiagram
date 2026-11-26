const ALLOWED_GITHUB_HOSTS = new Set(['api.github.com', 'raw.githubusercontent.com']);
const BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

function getTimeoutMs() {
  return Number(process.env.GITHUB_TIMEOUT_MS || 8000);
}

/**
 * Ensure any outbound GitHub fetch targets only fixed HTTPS hosts
 * (api.github.com and raw.githubusercontent.com) with no redirects.
 */
export function assertAllowedGithubUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const err = new Error('Invalid GitHub URL');
    err.status = 400;
    throw err;
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) {
    const err = new Error(`Disallowed host: ${parsed.hostname}`);
    err.status = 400;
    throw err;
  }

  return parsed.toString();
}

async function safeGithubFetch(url, options = {}) {
  const safeUrl = assertAllowedGithubUrl(url);
  const timeoutMs = getTimeoutMs();

  try {
    return await fetch(safeUrl, {
      ...options,
      redirect: 'error',
      signal: options.signal || AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      const timeoutErr = new Error(`GitHub API request timed out after ${timeoutMs}ms`);
      timeoutErr.status = 504;
      timeoutErr.code = 'GITHUB_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  }
}

// Build Authorization header using user's OAuth token when provided, or optional server token for public repos
function authHeaders(userToken = null) {
  const token = userToken || process.env.GITHUB_TOKEN;
  return {
    'User-Agent': 'DevDiagram-App',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Noise filters ─────────────────────────────────────────────────────────────
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.cache', '__pycache__', 'vendor', '.venv', 'venv',
]);

const IGNORED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'avif',
  'mp4', 'mp3', 'wav', 'pdf', 'zip', 'tar', 'gz', 'woff', 'woff2', 'ttf', 'eot',
  'min.js', 'min.css', 'map', 'lock',
]);

const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
  'Gemfile.lock', '.DS_Store', 'Thumbs.db',
]);

export function isIgnoredPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return true;
  const parts = filePath.split('/');

  // Ignore if any path segment is a noisy directory
  if (parts.some((p) => IGNORED_DIRS.has(p))) return true;

  const filename = parts[parts.length - 1];
  if (IGNORED_FILES.has(filename)) return true;

  // Ignore by extension (handles multi-part like .min.js)
  const lower = filename.toLowerCase();
  for (const ext of IGNORED_EXTENSIONS) {
    if (lower.endsWith(`.${ext}`)) return true;
  }

  return false;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/** Fetch the default branch, visibility, and repo metadata */
export async function fetchRepoMeta(owner, repo, userToken = null) {
  const res = await safeGithubFetch(`${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: { ...authHeaders(userToken), Accept: 'application/vnd.github+json' },
  });

  if (res.status === 404) {
    const err = new Error(`Repository "${owner}/${repo}" not found.`);
    err.status = 404;
    throw err;
  }
  if (res.status === 401) {
    const err = new Error('GitHub authentication failed or token expired.');
    err.status = 401;
    throw err;
  }
  if (res.status === 403 || res.status === 429) {
    const err = new Error('GitHub API rate limit exceeded or access forbidden.');
    err.status = res.status === 403 ? 403 : 429;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const isPrivate = Boolean(data.private);

  // Never allow server's global GITHUB_TOKEN to leak a private repo to a user without their own token
  if (isPrivate && !userToken) {
    const err = new Error(`Repository "${owner}/${repo}" is private. Sign in with GitHub access to view it.`);
    err.status = 403;
    throw err;
  }

  return {
    branch: data.default_branch,
    description: data.description || '',
    isPrivate,
  };
}

/** Fetch the full recursive file tree and filter noise */
export async function fetchFileTree(owner, repo, branch, userToken = null) {
  const res = await safeGithubFetch(
    `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    {
      headers: { ...authHeaders(userToken), Accept: 'application/vnd.github+json' },
    }
  );

  // Empty repository on GitHub returns 409 Conflict
  if (res.status === 409) {
    return { files: [], truncated: false, isEmpty: true };
  }

  if (!res.ok) {
    const err = new Error(`Failed to fetch file tree: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const truncated = data.truncated === true;

  // Filter to meaningful files and folders only
  const filtered = (data.tree || []).filter((item) => !isIgnoredPath(item.path));

  return { files: filtered, truncated, isEmpty: filtered.length === 0 };
}

/** Fetch README content (truncated to 8000 chars) */
export async function fetchReadme(owner, repo, userToken = null) {
  try {
    const res = await safeGithubFetch(
      `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      {
        headers: { ...authHeaders(userToken), Accept: 'application/vnd.github.raw' },
      }
    );
    if (!res.ok) return '';
    const text = await res.text();
    return text.slice(0, 8000);
  } catch (err) {
    if (err?.code === 'GITHUB_TIMEOUT') throw err;
    return '';
  }
}

/** Fetch raw file content strictly from raw.githubusercontent.com */
export async function fetchFileContent(owner, repo, branch, filePath, userToken = null) {
  try {
    const safeSegments = String(filePath)
      .split('/')
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .map(encodeURIComponent)
      .join('/');

    if (!safeSegments) return null;

    const url = `${RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${safeSegments}`;
    const res = await safeGithubFetch(url, {
      headers: authHeaders(userToken),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 12000);
  } catch (err) {
    if (err?.code === 'GITHUB_TIMEOUT') throw err;
    return null;
  }
}
