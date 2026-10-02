import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

// ── Suggested questions per mode ──────────────────────────────────────────────
function getSuggestedQuestions(node, owner, repo) {
  if (node) {
    return [
      `What does ${node.label} do in this project?`,
      `What are the main exports and imports in ${node.path}?`,
      `How does ${node.label} connect with other components?`,
    ];
  }
  return [
    `How does the ${repo} repository work and what is its architecture?`,
    `What is the tech stack and directory structure?`,
    `Where does execution start and what are the entry points?`,
    `How do I run or build this project locally?`,
  ];
}

// ── SSE streaming fetch ────────────────────────────────────────────────────────
async function streamChat({ owner, repo, branch, node, messages, onDelta, onDone, onError, signal }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, branch, node, messages }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      try {
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.type === 'delta') onDelta(payload.content);
        if (payload.type === 'done') onDone();
        if (payload.type === 'error') onError(payload.message);
      } catch {
        // skip malformed frames
      }
    }
  }
}

// ── ChatPanel Component ───────────────────────────────────────────────────────
export default function ChatPanel({ owner, repo, branch, selectedNode, onClearNode }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Focus input when node is selected
  useEffect(() => {
    if (selectedNode) {
      inputRef.current?.focus();
    }
  }, [selectedNode]);

  async function sendMessage(text) {
    const query = text.trim();
    if (!query || streaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg = { role: 'user', content: query };
    const historyForApi = [...messages, userMsg];

    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    setError(null);

    try {
      await streamChat({
        owner,
        repo,
        branch,
        node: selectedNode,
        messages: historyForApi,
        signal: controller.signal,
        onDelta: (chunk) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role !== 'assistant') return prev;
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + chunk },
            ];
          });
        },
        onDone: () => setStreaming(false),
        onError: (msg) => {
          setError(msg);
          setStreaming(false);
        },
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
      setStreaming(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleClearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setInput('');
  }

  const suggested = getSuggestedQuestions(selectedNode, owner, repo);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1.5px solid #e2e8f0',
        background: '#f8fafc',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16 }}>💬</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              AI Code Assistant
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                style={{
                  border: '1px solid #cbd5e1', borderRadius: 6,
                  background: '#ffffff', color: '#64748b',
                  fontSize: 11, padding: '2px 8px', cursor: 'pointer',
                }}
                title="Clear conversation history"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Active Context Banner */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: selectedNode ? '#ecfdf5' : '#f1f5f9',
          border: `1px solid ${selectedNode ? '#a7f3d0' : '#e2e8f0'}`,
          borderRadius: 8, padding: '5px 10px', fontSize: 11.5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span>{selectedNode ? '🎯' : '🗺️'}</span>
            <span style={{
              fontWeight: 600,
              color: selectedNode ? '#047857' : '#475569',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {selectedNode ? `Node: ${selectedNode.label}` : `Repository: ${owner}/${repo}`}
            </span>
          </div>

          {selectedNode && onClearNode && (
            <button
              onClick={onClearNode}
              style={{
                border: 'none', background: 'none',
                color: '#047857', fontWeight: 600, fontSize: 11,
                cursor: 'pointer', padding: '1px 4px', flexShrink: 0,
              }}
              title="Switch to asking about full repository"
            >
              Ask Full Repo ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Message Area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Welcome & Suggestions if empty */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: '14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>💡</div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: '0 0 4px' }}>
                {selectedNode ? `Ask about "${selectedNode.label}"` : `Ask anything about this repo`}
              </p>
              <p style={{ fontSize: 11.5, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                {selectedNode
                  ? `Inquired file: ${selectedNode.path || 'Component'}`
                  : `You can ask questions about the rising stairs architecture, code flow, or how any file works.`}
              </p>
            </div>

            {/* Suggested Prompts */}
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
                Suggested Questions
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {suggested.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    style={{
                      textAlign: 'left',
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 12,
                      color: '#334155',
                      cursor: 'pointer',
                      lineHeight: 1.4,
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#1e293b';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    💬 {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Bubbles */}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '88%',
                borderRadius: 14,
                padding: '9px 13px',
                fontSize: 13,
                lineHeight: 1.55,
                background: msg.role === 'user' ? '#1e293b' : '#f1f5f9',
                color: msg.role === 'user' ? '#ffffff' : '#0f172a',
                borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
                borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 14,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              {msg.role === 'assistant' ? (
                <div className="chat-markdown" style={{ fontSize: 12.5 }}>
                  <ReactMarkdown>{msg.content || (streaming ? '▌' : '')}</ReactMarkdown>
                </div>
              ) : (
                <p style={{ margin: 0 }}>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Error message */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '8px 12px', fontSize: 12, color: '#dc2626',
          }}>
            ⚠ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input Box (Always Active) ────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '12px 14px',
          borderTop: '1.5px solid #e2e8f0',
          background: '#ffffff',
          flexShrink: 0,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#f8fafc',
          border: '1.5px solid #cbd5e1',
          borderRadius: 12,
          padding: '4px 6px 4px 12px',
          transition: 'border-color 0.15s ease',
        }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              selectedNode
                ? `Ask about ${selectedNode.label}…`
                : `Ask any question about ${owner}/${repo}…`
            }
            disabled={streaming}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              color: '#0f172a',
            }}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            style={{
              background: input.trim() && !streaming ? '#1e293b' : '#e2e8f0',
              color: input.trim() && !streaming ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: input.trim() && !streaming ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
            }}
          >
            {streaming ? '…' : 'Send ↑'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 4px' }}>
          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
            {selectedNode ? `Focused on ${selectedNode.path || selectedNode.label}` : 'Full repository assistant'}
          </span>
          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Enter to send</span>
        </div>
      </form>
    </div>
  );
}
