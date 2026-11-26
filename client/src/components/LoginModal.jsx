import { useState, useEffect } from 'react';
import axios from 'axios';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.14 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export default function LoginModal({ open, onClose, onAuthSuccess }) {
  const [providers, setProviders] = useState({ google: false, github: false });
  const [notice, setNotice] = useState(null);
  const [busyProvider, setBusyProvider] = useState(null);

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    axios
      .get('/api/auth/providers')
      .then(({ data }) => setProviders(data))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleOAuth(provider) {
    if (providers[provider]) {
      const returnTo = encodeURIComponent(window.location.pathname || '/');
      window.location.href = `/api/auth/${provider}?returnTo=${returnTo}`;
      return;
    }
    const envKeys =
      provider === 'google'
        ? 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'
        : 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET';
    setNotice({
      provider,
      message: `${provider === 'google' ? 'Google' : 'GitHub'} OAuth is not configured yet. Add ${envKeys} in .env to enable live OAuth, or use a demo session below.`,
    });
  }

  async function handleDemoLogin(provider) {
    setBusyProvider(provider);
    try {
      const { data } = await axios.post('/api/auth/demo', { provider });
      onAuthSuccess(data.user);
      onClose();
    } catch {
      setNotice({ provider, message: 'Failed to sign in with demo session.' });
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-card-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(33, 37, 41, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* Login Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#fffef7',
          border: '2px solid #212529',
          borderRadius: 16,
          boxShadow: '6px 6px 0 #212529',
          padding: '28px 26px 24px',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          id="close-login-modal"
          onClick={onClose}
          aria-label="Close login modal"
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            background: 'transparent',
            border: 'none',
            fontSize: 22,
            lineHeight: 1,
            color: '#6b7280',
            cursor: 'pointer',
          }}
        >
          ×
        </button>

        {/* Card Header */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>🗺️</div>
          <h2
            id="login-card-title"
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: 30,
              fontWeight: 700,
              color: '#212529',
              margin: '0 0 4px',
            }}
          >
            Sign in to DevDiagram
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            Save your architecture maps and chat seamlessly
          </p>
        </div>

        {/* OAuth Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            id="google-login-btn"
            type="button"
            onClick={() => handleOAuth('google')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '11px 16px',
              borderRadius: 10,
              border: '2px solid #212529',
              background: '#ffffff',
              color: '#212529',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '3px 3px 0 #e9dfc8',
              cursor: 'pointer',
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#f08c00';
              e.currentTarget.style.boxShadow = '3px 3px 0 #f08c0040';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#212529';
              e.currentTarget.style.boxShadow = '3px 3px 0 #e9dfc8';
            }}
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          <button
            id="github-login-btn"
            type="button"
            onClick={() => handleOAuth('github')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '11px 16px',
              borderRadius: 10,
              border: '2px solid #000',
              background: '#212529',
              color: '#f8f9fa',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '3px 3px 0 #000',
              cursor: 'pointer',
              transition: 'transform 0.1s ease, opacity 0.1s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.92';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <GitHubIcon />
            <span>Continue with GitHub</span>
          </button>
        </div>

        {/* Inline notice if OAuth env vars are not configured yet */}
        {notice && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#fff3bf',
              border: '1.5px solid #f59f00',
              fontSize: 12,
              color: '#5c3a00',
              lineHeight: 1.45,
            }}
          >
            <p style={{ margin: '0 0 8px' }}>{notice.message}</p>
            <button
              id="demo-login-btn"
              type="button"
              disabled={Boolean(busyProvider)}
              onClick={() => handleDemoLogin(notice.provider)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 8,
                border: '1.5px solid #5c3a00',
                background: '#fffef7',
                color: '#212529',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {busyProvider ? 'Signing in…' : `Continue as ${notice.provider === 'google' ? 'Google' : 'GitHub'} Demo User`}
            </button>
          </div>
        )}

        <p style={{ marginTop: 18, marginBottom: 0, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
          Secure OAuth 2.0 authentication
        </p>
      </div>
    </div>
  );
}
