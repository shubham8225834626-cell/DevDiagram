import { useState } from 'react';

// Accepts: https://github.com/owner/repo  OR  owner/repo
function parseGitHubUrl(input) {
  const trimmed = input.trim().replace(/\/$/, '');

  // Full URL pattern
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/
  );
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };

  // Short "owner/repo" pattern
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };

  return null;
}

export default function HomePage({ onNavigate }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const parsed = parseGitHubUrl(input);
    if (!parsed) {
      setError('Enter a GitHub URL or owner/repo shorthand.');
      return;
    }
    onNavigate(parsed.owner, parsed.repo);
  }

  const examples = [
    'facebook/react',
    'expressjs/express',
    'vitejs/vite',
    'tiangolo/fastapi',
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fdf6e3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>

      {/* Decorative background sketch lines */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.08 }} aria-hidden>
        <line x1="10%" y1="0" x2="10%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="30%" y1="0" x2="30%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="70%" y1="0" x2="70%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="90%" y1="0" x2="90%" y2="100%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="0" y1="20%" x2="100%" y2="20%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
        <line x1="0" y1="80%" x2="100%" y2="80%" stroke="#f08c00" strokeWidth="1" strokeDasharray="8 12" />
      </svg>

      {/* Header */}
      <div style={{ marginBottom: 40, textAlign: 'center', position: 'relative' }}>
        <div style={{ fontSize: 64, marginBottom: 8, filter: 'drop-shadow(2px 3px 0 #f08c0040)' }}>🗺️</div>
        <h1 style={{
          fontFamily: "'Caveat', cursive",
          fontSize: 52,
          fontWeight: 700,
          color: '#212529',
          margin: '0 0 8px',
          letterSpacing: '-0.5px',
          textShadow: '3px 3px 0 #f08c0030',
        }}>
          DevDiagram
        </h1>
        <p style={{ color: '#6b7280', fontSize: 16, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
          Paste a GitHub repo URL and get an <strong>interactive mind map</strong> of its architecture, 
          explained with interactive AI.
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            id="repo-url-input"
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            placeholder="https://github.com/owner/repo  or  owner/repo"
            style={{
              flex: 1,
              border: '2px solid #e9dfc8',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              background: '#fffef7',
              color: '#212529',
              outline: 'none',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '3px 3px 0 #e9dfc8',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#f08c00'; e.target.style.boxShadow = '3px 3px 0 #f08c0040'; }}
            onBlur={e => { e.target.style.borderColor = '#e9dfc8'; e.target.style.boxShadow = '3px 3px 0 #e9dfc8'; }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button
            id="generate-btn"
            type="submit"
            disabled={!input.trim()}
            style={{
              background: input.trim() ? '#212529' : '#adb5bd',
              color: '#f8f9fa',
              border: '2px solid #000',
              borderRadius: 10,
              padding: '12px 22px',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "'Caveat', cursive",
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              boxShadow: input.trim() ? '3px 3px 0 #000' : 'none',
              transition: 'all 0.12s ease',
            }}
            onMouseDown={e => { if (input.trim()) e.currentTarget.style.transform = 'translate(2px,2px)'; e.currentTarget.style.boxShadow = '1px 1px 0 #000'; }}
            onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = input.trim() ? '3px 3px 0 #000' : 'none'; }}
          >
            Map it →
          </button>
        </div>

        {/* Validation error */}
        {error && (
          <p style={{ marginTop: 8, color: '#c92a2a', fontFamily: "'Caveat', cursive", fontSize: 15 }}>
            ⚠ {error}
          </p>
        )}
      </form>

      {/* Quick-access examples */}
      <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#adb5bd', alignSelf: 'center', marginRight: 4 }}>Try:</span>
        {examples.map((ex) => (
          <button
            key={ex}
            id={`example-${ex.replace('/', '-')}`}
            onClick={() => { setInput(ex); setError(''); }}
            style={{
              fontSize: 12,
              border: '1.5px solid #e9dfc8',
              borderRadius: 20,
              padding: '4px 14px',
              color: '#495057',
              background: '#fffef7',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#f08c00'; e.currentTarget.style.color = '#212529'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e9dfc8'; e.currentTarget.style.color = '#495057'; }}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Features row */}
      <div style={{ marginTop: 48, display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { icon: '🧠', title: 'AI-Powered', desc: 'AI automatically maps the architecture' },
          { icon: '✏️', title: 'Mind Map', desc: 'Excalidraw-style interactive diagram' },
          { icon: '💬', title: 'AI Chat', desc: 'Click any node to get an explanation' },
          { icon: '⚡', title: 'Cached', desc: '7-day cache for instant reload' },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{
            background: '#fffef7',
            border: '1.5px solid #e9dfc8',
            borderRadius: 12,
            padding: '14px 18px',
            width: 160,
            textAlign: 'center',
            boxShadow: '3px 3px 0 #e9dfc8',
          }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#212529', marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p style={{ marginTop: 40, fontSize: 11, color: '#d1d5db' }}>
        Set <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>GITHUB_TOKEN</code> in .env to avoid rate limits
      </p>
    </div>
  );
}
