import { Router } from 'express';
import { fetchFileContent, fetchReadme } from '../services/github.js';
import { streamCompletion } from '../services/llm.js';

const router = Router();

// ── POST /api/chat ────────────────────────────────────────────────────────────
// Streams response via Server-Sent Events (SSE)
router.post('/', async (req, res) => {
  const { owner, repo, branch, node, messages } = req.body;

  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo are required.' });
  }

  // ── Set up SSE headers ──────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let systemPrompt = '';

    if (node && (node.path || node.label)) {
      // Node-specific grounding
      let fileContent = null;
      if (node.type === 'file' && node.path && branch) {
        fileContent = await fetchFileContent(owner, repo, branch, node.path);
      }

      systemPrompt = fileContent
        ? `You are an expert software architect and friendly code tutor helping a developer understand this repository: "${owner}/${repo}".
The user has selected file: "${node.path}" (label: "${node.label}").
Here is the actual file content (truncated to 12,000 chars):

\`\`\`
${fileContent}
\`\`\`

Rules:
- Explain in simple, clear, concise language.
- Quote relevant code lines when helpful.
- If asked about something outside this file, explain how this file connects with the rest of the project.`
        : `You are an expert software architect helping a developer understand "${owner}/${repo}".
The user has selected component: "${node.label}" (path: "${node.path || 'N/A'}", type: ${node.type || 'module'}).
Summary: ${node.summary || 'No summary available.'}

Explain this component's role and purpose in simple, clear language.`;
    } else {
      // General repository chat
      const readme = await fetchReadme(owner, repo);
      systemPrompt = `You are an expert software architect and friendly AI assistant for the GitHub repository "${owner}/${repo}".
The user is asking questions about the overall project, code architecture, how to run/test the codebase, tech stack, or how different components work together.

Repository README (first 8,000 chars):
\`\`\`
${readme || 'No README available.'}
\`\`\`

Rules:
- Provide clear, friendly, and technically accurate answers.
- Explain the high-level architecture, entry points, technology stack, and component interactions clearly.
- Use markdown formatting with code blocks, lists, and bold text for readability.
- When asked general questions, answer thoroughly and concisely.`;
    }

    // Build message history for the LLM
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...(messages || []).map((m) => ({ role: m.role, content: m.content })),
    ];

    // Stream tokens to the client
    for await (const delta of streamCompletion(llmMessages)) {
      send({ type: 'delta', content: delta });
    }

    send({ type: 'done' });
  } catch (err) {
    console.error('[Chat Route] Error:', err.message);
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

export default router;
