import { generateCompletion } from './llm.js';

// ── Prompt builders ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software architect. Your job is to analyze a GitHub repository's file tree and README, then produce a clean, meaningful architecture diagram.

Rules:
1. Return ONLY valid JSON — no markdown fences, no explanation text whatsoever.
2. Max 25 nodes. Group by feature/layer (e.g. "API Routes", "Frontend Pages", "Database Models") rather than mirroring raw folder depth.
3. Every node "path" MUST exactly match a path from the provided file tree.
4. Use meaningful labels (e.g. "Express Server", "Auth Middleware") not raw filenames.
5. Edges represent meaningful relationships (imports, calls, depends-on).

JSON shape:
{
  "nodes": [
    { "id": "string", "label": "string", "path": "string", "type": "file|folder", "summary": "one-sentence description" }
  ],
  "edges": [
    { "from": "node-id", "to": "node-id" }
  ]
}`;

function buildUserPrompt(owner, repo, description, fileList, readme, wasTruncated) {
  const truncNote = wasTruncated
    ? '\n⚠️  The file tree was truncated (repo is very large). Summarize by top-level feature folders.'
    : '';

  return `Repository: ${owner}/${repo}
Description: ${description || 'No description provided.'}
${truncNote}

--- FILE TREE (filtered) ---
${fileList}

--- README (truncated to 8000 chars) ---
${readme || 'No README available.'}

Produce the architecture diagram JSON now.`;
}

// ── JSON extraction helpers ───────────────────────────────────────────────────

/** Strip markdown code fences if the LLM wrapped the JSON anyway */
function stripFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/** Try to parse JSON; returns parsed object or null */
function tryParse(text) {
  try {
    return JSON.parse(stripFences(text));
  } catch {
    // Attempt to extract a JSON block embedded in text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Path validation ───────────────────────────────────────────────────────────

/**
 * Mark nodes whose paths don't actually exist in the real file tree.
 * This catches hallucinated paths from the LLM.
 */
function validateNodes(nodes, realPaths) {
  const pathSet = new Set(realPaths);
  return nodes.map((node) => ({
    ...node,
    valid: pathSet.has(node.path),
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a compact file list string from the GitHub tree response.
 * If the tree is huge, keep only files up to a character budget.
 */
export function buildFileList(files) {
  const MAX_CHARS = 6000;
  let result = '';
  for (const f of files) {
    const line = `${f.type === 'tree' ? 'dir' : 'file'} ${f.path}\n`;
    if (result.length + line.length > MAX_CHARS) {
      result += '... (truncated for prompt length)\n';
      break;
    }
    result += line;
  }
  return result;
}

/**
 * Call the LLM to generate the diagram graph. Retries up to 2 times on
 * parse failure. Validates node paths against the real file tree.
 */
export async function generateGraph(owner, repo, description, files, readme) {
  const realPaths = files.map((f) => f.path);
  const fileList = buildFileList(files);
  const wasTruncated = files.some((f) => f.path.includes('(truncated'));

  const userPrompt = buildUserPrompt(owner, repo, description, fileList, readme, wasTruncated);

  let lastError = null;

  // Retry loop (max 3 attempts total)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
    try {
      const raw = await generateCompletion(SYSTEM_PROMPT, userPrompt);
      const parsed = tryParse(raw);

      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        lastError = new Error(`LLM returned invalid JSON structure (attempt ${attempt + 1})`);
        console.warn(`[Diagram] Parse attempt ${attempt + 1} failed:`, raw.slice(0, 200));
        continue; // retry
      }

      // Cap nodes to 25
      const nodes = parsed.nodes.slice(0, 25);
      const nodeIds = new Set(nodes.map((n) => n.id));

      // Only keep edges that reference existing node IDs
      const edges = parsed.edges.filter(
        (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
      );

      const validatedNodes = validateNodes(nodes, realPaths);

      return { nodes: validatedNodes, edges };
    } catch (err) {
      lastError = err;
      console.warn(`[Diagram] LLM attempt ${attempt + 1} error:`, err.message);
    }
  }

  throw new Error(`Failed to generate diagram after 3 attempts: ${lastError?.message}`);
}
