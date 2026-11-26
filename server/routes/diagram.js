import { Router } from 'express';
import Diagram from '../models/Diagram.js';
import { fetchRepoMeta, fetchFileTree, fetchReadme } from '../services/github.js';
import { generateGraph } from '../services/diagram.js';
import { getSessionUser, getUserGithubToken } from './auth.js';
import { diagramRequestSchema } from '../utils/validation.js';
import { createSingleFlight } from '../utils/singleFlight.js';
import { setPrivateRepoNodes } from '../utils/privateNodeStore.js';
import { verifyTurnstile } from '../middleware/turnstile.js';

const router = Router();
const diagramSingleFlight = createSingleFlight();

// ── POST /api/diagram ─────────────────────────────────────────────────────────
router.post('/', verifyTurnstile, async (req, res) => {
  const parsed = diagramRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues.map((i) => i.message).join('; '),
    });
  }

  const { owner, repo } = parsed.data;
  const repoKey = `${owner}/${repo}`;
  const sessionUser = getSessionUser(req);
  const userToken = sessionUser ? await getUserGithubToken(sessionUser) : null;

  // Scope single-flight key by user when authenticated so two users never share private in-flight results
  const flightKey = sessionUser ? `auth:${sessionUser.id}:${repoKey}` : `public:${repoKey}`;

  try {
    const data = await diagramSingleFlight.run(flightKey, async () => {
      // 1. Check MongoDB cache first (only public repositories are ever persisted here)
      const cached = await Diagram.findOne({ repoKey }).lean();
      if (cached) {
        console.log(`[Cache] HIT for ${repoKey}`);
        return {
          graph: cached.graph,
          branch: cached.branch,
          truncated: cached.truncated,
          private: false,
          cached: true,
        };
      }

      console.log(`[Cache] MISS for ${repoKey} — fetching from GitHub…`);

      // 2. Fetch repo metadata (checks visibility & user authorization) and README in parallel
      const [{ branch, description, isPrivate }, readme] = await Promise.all([
        fetchRepoMeta(owner, repo, userToken),
        fetchReadme(owner, repo, userToken),
      ]);

      // 3. Fetch filtered file tree
      const { files, truncated, isEmpty } = await fetchFileTree(owner, repo, branch, userToken);
      if (isEmpty) {
        const err = new Error(`Repository "${repoKey}" is empty (no files found).`);
        err.status = 400;
        throw err;
      }

      // 4. Generate graph via LLM (with Zod schema validation + tree path checks)
      const graph = await generateGraph(owner, repo, description, files, readme);

      // 5. Private repos are NEVER cached in MongoDB; only ephemeral per-user node lookup is kept for chat
      if (isPrivate) {
        if (sessionUser?.id) {
          setPrivateRepoNodes(sessionUser.id, repoKey, branch, graph.nodes);
        }
        return { graph, branch, truncated, private: true, cached: false };
      }

      // 6. Persist public diagram to cache
      await Diagram.findOneAndUpdate(
        { repoKey },
        {
          $set: { repoKey, branch, graph, truncated, createdAt: new Date() },
        },
        { upsert: true, new: true }
      );

      return { graph, branch, truncated, private: false, cached: false };
    });

    return res.json(data);
  } catch (err) {
    console.error(`[Diagram Route] Error for ${repoKey}:`, err.message);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
});

export default router;
