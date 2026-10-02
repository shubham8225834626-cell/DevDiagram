# RepoMap 🗺️

> Paste a GitHub repository URL → get an interactive architecture diagram + AI assistant that explains every component.

## Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB running locally (`mongod`) **or** a MongoDB Atlas connection string
- An LLM API key (OpenAI, OpenRouter, Groq, Gemini, Ollama, etc.)

---

### 1. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# LLM — works with any OpenAI-compatible provider
LLM_BASE_URL=https://openrouter.ai/api/v1    # or https://api.openai.com/v1
LLM_API_KEY=your_key_here
LLM_MODEL=openai/gpt-4o-mini                 # or google/gemini-flash-1.5, etc.

# Optional: different models for graph vs. chat
# GRAPH_MODEL=openai/gpt-4o
# CHAT_MODEL=openai/gpt-4o-mini

# GitHub (optional but strongly recommended — raises limit to 5000 req/hr)
GITHUB_TOKEN=ghp_your_token_here

# MongoDB
MONGODB_URI=mongodb://localhost:27017/repomap

# Server port
PORT=3001
```

---

### 2. Install dependencies

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

---

### 3. Run (two terminals)

**Terminal 1 — Backend**
```bash
cd server
npm run dev
# → [DB] Connected to MongoDB
# → [Server] Running on http://localhost:3001
```

**Terminal 2 — Frontend**
```bash
cd client
npm run dev
# → VITE ready at http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Supported LLM Providers

| Provider | `LLM_BASE_URL` | Notes |
|----------|---------------|-------|
| **OpenAI** | `https://api.openai.com/v1` | Default |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Access 100+ models |
| **Groq** | `https://api.groq.com/openai/v1` | Ultra-fast inference |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-1.5-flash` |
| **Ollama** (local) | `http://localhost:11434/v1` | `LLM_API_KEY=ollama` |

---

## Architecture

```
client/
  src/
    App.jsx              # Lightweight state-based router
    pages/
      HomePage.jsx       # URL input + validation
      RepoPage.jsx       # Main layout: diagram + chat
    components/
      DiagramView.jsx    # ReactFlow + dagre layout + custom nodes
      ChatPanel.jsx      # SSE streaming chat with react-markdown
    index.css            # Global styles + ReactFlow overrides

server/
  index.js              # Express app + CORS + rate limiting + MongoDB
  models/
    Diagram.js           # Mongoose model with 7-day TTL cache
  routes/
    diagram.js           # POST /api/diagram
    chat.js              # POST /api/chat  (SSE streaming)
  services/
    github.js            # Fetch repo meta, file tree, README, raw content
    llm.js               # Provider-agnostic: one-shot + streaming
    diagram.js           # LLM graph gen, JSON validation, path verification
```

---

## API Reference

### `POST /api/diagram`
```json
{ "owner": "facebook", "repo": "react" }
```
Returns:
```json
{
  "graph": {
    "nodes": [{ "id", "label", "path", "type", "summary", "valid" }],
    "edges": [{ "from", "to" }]
  },
  "branch": "main",
  "truncated": false,
  "cached": false
}
```

### `POST /api/chat`  (Server-Sent Events)
```json
{ "owner": "...", "repo": "...", "branch": "...", "node": { ... }, "messages": [ ... ] }
```
Stream events:
- `{ "type": "delta", "content": "..." }` — incremental token
- `{ "type": "done" }` — end of stream
- `{ "type": "error", "message": "..." }` — error

---

## How It Works

1. **URL input** → parsed to `owner/repo`
2. **Cache check** → MongoDB (7-day TTL)
3. **GitHub fetch** → default branch, recursive file tree (filtered), README
4. **LLM graph gen** → system prompt asks for max-25-node JSON grouped by feature layer; retries up to 3 times on parse failure
5. **Path validation** → every node `path` checked against real file tree; invalid nodes marked `valid: false` and greyed out
6. **ReactFlow render** → dagre left-to-right auto-layout, colourful nodes
7. **Click a node** → AI chat panel loads file content (≤12k chars) as grounding context
8. **Chat streams** → SSE from Express → fetch ReadableStream → react-markdown renders

---

## Future Improvements
- User auth & personal repo history
- Export diagram as PNG/SVG
- Diff view: re-generate on new commit (webhook)
- Keyboard navigation across diagram nodes
- Multi-repo comparison mode
