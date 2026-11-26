/**
 * Ephemeral in-memory node lookup store scoped strictly by (userId, repoKey).
 * Used ONLY for server-side nodeId -> filePath resolution in /api/chat for private repos
 * so private diagrams themselves are NEVER cached in MongoDB or shared across users.
 */
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const store = new Map();

function makeKey(userId, repoKey) {
  return `${userId}:${repoKey}`;
}

export function setPrivateRepoNodes(userId, repoKey, branch, nodes, ttlMs = DEFAULT_TTL_MS) {
  if (!userId || !repoKey || !Array.isArray(nodes)) return;
  const key = makeKey(userId, repoKey);
  store.set(key, {
    branch,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      path: n.path,
      type: n.type,
      summary: n.summary,
    })),
    expiresAt: Date.now() + ttlMs,
  });
}

export function getPrivateRepoNodes(userId, repoKey) {
  if (!userId || !repoKey) return null;
  const key = makeKey(userId, repoKey);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function clearPrivateRepoNodes() {
  store.clear();
}
