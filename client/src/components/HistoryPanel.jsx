import { useState, useEffect } from 'react';
import axios from 'axios';

function formatRelativeTime(dateStr) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function HistoryPanel({ user, currentOwner, currentRepo, readyToRecord = true, onNavigate, onOpenLogin }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const currentKey = `${currentOwner}/${currentRepo}`;

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const recordPromise = readyToRecord
      ? axios.post('/api/history', { owner: currentOwner, repo: currentRepo }).catch(() => {})
      : Promise.resolve();

    recordPromise.finally(() => {
      axios
        .get('/api/history')
        .then(({ data }) => {
          if (!cancelled) setHistory(data.history || []);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [user, currentOwner, currentRepo, readyToRecord]);

  async function handleClear() {
    await axios.delete('/api/history').catch(() => {});
    setHistory([]);
  }

  return (
    <div style={{ position: 'absolute', left: 16, bottom: 64, zIndex: 20 }}>
      {/* Expandable History Card */}
      {open && (
        <div
          style={{
            width: 260,
            maxHeight: 320,
            marginBottom: 8,
            background: '#fffef7',
            border: '2px solid #212529',
            borderRadius: 12,
            boxShadow: '4px 4px 0 #212529',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 12px',
              borderBottom: '1.5px solid #e9dfc8',
              background: '#fdf6e3',
            }}
          >
            <span style={{ fontFamily: "'Caveat', cursive", fontSize: 17, fontWeight: 700, color: '#212529' }}>
              🕒 Visited Repos
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user && history.length > 0 && (
                <button
                  onClick={handleClear}
                  style={{
                    border: 'none',
                    background: 'none',
                    fontSize: 11,
                    color: '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close history"
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: 16,
                  lineHeight: 1,
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!user ? (
              <div style={{ padding: '12px 8px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.4 }}>
                  Sign in to save and revisit your repository history.
                </p>
                <button
                  onClick={onOpenLogin}
                  style={{
                    fontFamily: "'Caveat', cursive",
                    fontSize: 15,
                    fontWeight: 700,
                    padding: '5px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #212529',
                    background: '#f08c00',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Sign in
                </button>
              </div>
            ) : loading && history.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0', margin: 0 }}>
                Loading history…
              </p>
            ) : history.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0', margin: 0 }}>
                No visited repositories yet.
              </p>
            ) : (
              history.map((item) => {
                const isCurrent = item.repoKey === currentKey;
                return (
                  <button
                    key={item.repoKey}
                    onClick={() => {
                      if (!isCurrent && onNavigate) {
                        onNavigate(item.owner, item.repo);
                        setOpen(false);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 9px',
                      borderRadius: 8,
                      border: isCurrent ? '1.5px solid #f08c00' : '1px solid transparent',
                      background: isCurrent ? '#fff3bf' : 'transparent',
                      cursor: isCurrent ? 'default' : 'pointer',
                    }}
                    className={isCurrent ? '' : 'hover:bg-amber-50 transition'}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: isCurrent ? 700 : 500,
                        color: '#212529',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.repoKey}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#9ca3af', flexShrink: 0 }}>
                      {formatRelativeTime(item.visitedAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Left-most Toggle Pill */}
      <button
        id="history-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 999,
          border: '1.5px solid #e9dfc8',
          background: open ? '#212529' : '#fffef7',
          color: open ? '#f8f9fa' : '#212529',
          fontSize: 12.5,
          fontWeight: 600,
          boxShadow: '2px 2px 0 #e9dfc8',
          cursor: 'pointer',
        }}
      >
        <span>🕒</span>
        <span>History</span>
        {user && history.length > 0 && (
          <span
            style={{
              background: '#f08c00',
              color: '#fff',
              fontSize: 10.5,
              fontWeight: 700,
              borderRadius: 999,
              padding: '0 6px',
              lineHeight: '16px',
            }}
          >
            {history.length}
          </span>
        )}
      </button>
    </div>
  );
}
