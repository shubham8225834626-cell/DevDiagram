import { useState, useEffect } from 'react';
import axios from 'axios';
import DiagramView from '../components/DiagramView.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

export default function RepoPage({ owner, repo, onHome }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [graph, setGraph] = useState(null);     // { nodes, edges }
  const [branch, setBranch] = useState('main');
  const [truncated, setTruncated] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  // Fetch diagram on mount
  useEffect(() => {
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelectedNode(null);

    axios
      .post('/api/diagram', { owner, repo })
      .then(({ data }) => {
        setGraph(data.graph);
        setBranch(data.branch || 'main');
        setTruncated(data.truncated || false);
      })
      .catch((err) => {
        const msg =
          err.response?.data?.error ||
          err.message ||
          'Failed to generate diagram.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [owner, repo]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#fdf6e3' }}>
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header style={{ background: '#212529', borderBottom: '2px solid #343a40' }}
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            id="back-home-btn"
            onClick={onHome}
            style={{ color: '#adb5bd', fontFamily: "'Caveat', cursive", fontSize: 16 }}
            className="hover:text-white transition"
          >
            ← Home
          </button>
          <span style={{ color: '#495057' }}>|</span>
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#f8f9fa', fontFamily: "'Caveat', cursive", fontSize: 17, fontWeight: 700 }}
            className="hover:underline"
          >
            🗺️ {owner}/{repo}
          </a>
          {branch && (
            <span style={{ background: '#343a40', color: '#adb5bd', fontSize: 11, borderRadius: 20, padding: '2px 10px', fontFamily: "'Caveat', cursive" }}>
              {branch}
            </span>
          )}
          {truncated && (
            <span style={{ background: '#fff3bf', color: '#5c3a00', fontSize: 11, borderRadius: 20, padding: '2px 10px', border: '1px solid #f59f00' }}>
              ⚠ Large repo — truncated
            </span>
          )}
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Diagram canvas */}
        <div className="flex-1 relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
              style={{ background: '#fdf6e3' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '4px solid #f08c00', borderTopColor: 'transparent',
                marginBottom: 20,
              }} className="loading-spin" />
              <p style={{ fontFamily: "'Caveat', cursive", fontSize: 20, color: '#495057', marginBottom: 4 }}>
                Analysing repository…
              </p>
              <p style={{ fontSize: 13, color: '#adb5bd' }}>
                Mapping repository architecture — takes 10–20s first time
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-8"
              style={{ background: '#fdf6e3' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✏️</div>
              <p style={{ fontFamily: "'Caveat', cursive", fontSize: 24, color: '#212529', marginBottom: 6 }}>
                Couldn't draw the map
              </p>
              <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', maxWidth: 380, marginBottom: 20 }}>
                {error}
              </p>
              <button
                onClick={onHome}
                style={{
                  fontFamily: "'Caveat', cursive", fontSize: 16,
                  background: '#212529', color: '#f8f9fa',
                  border: 'none', borderRadius: 8, padding: '8px 22px', cursor: 'pointer',
                }}
              >
                ← Try another repository
              </button>
            </div>
          )}

          {!loading && !error && graph && (
            <DiagramView
              graph={graph}
              branch={branch}
              owner={owner}
              repo={repo}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          )}
        </div>

        {/* Right: Chat panel */}
        <div style={{ width: 360, borderLeft: '2px solid #e9dfc8', flexShrink: 0, background: '#fff' }}>
          <ChatPanel
            owner={owner}
            repo={repo}
            branch={branch}
            selectedNode={selectedNode}
            onClearNode={() => setSelectedNode(null)}
          />
        </div>
      </div>
    </div>
  );
}
