import fetch from 'node-fetch';

const BASE = 'https://api.github.com';

// Build Authorization header only when token is set
function authHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
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

function isIgnoredPath(filePath) {
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

/** Fetch the default branch and repo metadata */
export async function fetchRepoMeta(owner, repo) {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}`, {
    headers: { ...authHeaders(), Accept: 'application/vnd.github+json' },
  });

  if (res.status === 404) {
    const err = new Error(`Repository "${owner}/${repo}" not found.`);
    err.status = 404;
    throw err;
  }
  if (res.status === 403 || res.status === 429) {
    const err = new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN in .env to raise limits.');
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return { branch: data.default_branch, description: data.description || '' };
}

/** Fetch the full recursive file tree and filter noise */
export async function fetchFileTree(owner, repo, branch) {
  const res = await fetch(
    `${BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { ...authHeaders(), Accept: 'application/vnd.github+json' } }
  );

  if (!res.ok) {
    const err = new Error(`Failed to fetch file tree: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const truncated = data.truncated === true; // GitHub flag for huge repos

  // Filter to meaningful files and folders only
  const filtered = (data.tree || []).filter((item) => !isIgnoredPath(item.path));

  return { files: filtered, truncated };
}

/** Fetch README content (truncated to maxChars) */
export async function fetchReadme(owner, repo) {
  try {
    const res = await fetch(`${BASE}/repos/${owner}/${repo}/readme`, {
      headers: { ...authHeaders(), Accept: 'application/vnd.github.raw' },
    });
    if (!res.ok) return '';
    const text = await res.text();
    // Truncate to ~8000 characters to keep prompt cost reasonable
    return text.slice(0, 8000);
  } catch {
    return ''; // README is optional
  }
}

/** Fetch raw file content from raw.githubusercontent.com */
export async function fetchFileContent(owner, repo, branch, filePath) {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return null;
    const text = await res.text();
    // Limit to ~12000 chars for chat prompt
    return text.slice(0, 12000);
  } catch {
    return null;
  }
}
