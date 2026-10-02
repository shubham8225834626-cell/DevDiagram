import { Router } from 'express';
import Diagram from '../models/Diagram.js';
import { fetchRepoMeta, fetchFileTree, fetchReadme } from '../services/github.js';
import { generateGraph } from '../services/diagram.js';

const router = Router();

// In-flight request deduplication: prevents simultaneous parallel calls for the same repo
const inFlight = new Map();

// ── POST /api/diagram ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { owner, repo } = req.body;

  // Basic validation
  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo are required.' });
  }

  const repoKey = `${owner}/${repo}`;

  // If a request for this repo is already in-flight, await the same promise
  if (inFlight.has(repoKey)) {
    try {
      const data = await inFlight.get(repoKey);
      return res.json(data);
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
  }

  const taskPromise = (async () => {
    // 1. Check MongoDB cache first
    const cached = await Diagram.findOne({ repoKey });
    if (cached) {
      console.log(`[Cache] HIT for ${repoKey}`);
      return {
        graph: cached.graph,
        branch: cached.branch,
        truncated: cached.truncated,
        cached: true,
      };
    }

    console.log(`[Cache] MISS for ${repoKey} — fetching from GitHub…`);

    // 2. Fetch repo metadata (default branch, description)
    const { branch, description } = await fetchRepoMeta(owner, repo);

    // 3. Fetch filtered file tree and README in parallel
    const [{ files, truncated }, readme] = await Promise.all([
      fetchFileTree(owner, repo, branch),
      fetchReadme(owner, repo),
    ]);

    // 4. Generate graph via LLM (with retry + path validation)
    const graph = await generateGraph(owner, repo, description, files, readme);

    // 5. Persist to cache
    await Diagram.create({ repoKey, branch, graph, truncated });

    return { graph, branch, truncated, cached: false };
  })();

  inFlight.set(repoKey, taskPromise);

  try {
    const data = await taskPromise;
    return res.json(data);
  } catch (err) {
    console.error(`[Diagram Route] Error for ${repoKey}:`, err.message);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  } finally {
    inFlight.delete(repoKey);
  }
});

export default router;
