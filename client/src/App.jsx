import { useState, useEffect } from 'react';
import axios from 'axios';
import HomePage from './pages/HomePage.jsx';
import RepoPage from './pages/RepoPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import LoginModal from './components/LoginModal.jsx';

/**
 * Parse current browser URL into route state.
 * Supports:
 *   /              -> Home
 *   /:owner/:repo  -> Repo diagram
 *   /404 or others -> 404 Not Found
 */
function parseCurrentRoute() {
  const pathname = window.location.pathname;
  const cleanPath = pathname.replace(/^\/+/, '').replace(/\/+$/, '');

  if (!cleanPath) {
    return { view: 'home', repoInfo: null, path: '/' };
  }

  if (cleanPath === '404') {
    return { view: '404', repoInfo: null, path: '/404' };
  }

  const parts = cleanPath.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const isValidSlug = (s) => /^[a-zA-Z0-9_.-]+$/.test(s);
    if (isValidSlug(parts[0]) && isValidSlug(parts[1])) {
      return {
        view: 'repo',
        repoInfo: { owner: parts[0], repo: parts[1] },
        path: pathname,
      };
    }
  }

  // Any unmatched or malformed URL route triggers the custom 404 page
  return { view: '404', repoInfo: null, path: pathname };
}

export default function App() {
  const [route, setRoute] = useState(parseCurrentRoute);
  const [user, setUser] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    axios
      .get('/api/auth/me')
      .then(({ data }) => setUser(data.user || null))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await axios.post('/api/auth/logout').catch(() => {});
    setUser(null);
  }

  function navigate(owner, repo) {
    setRoute({
      view: 'repo',
      repoInfo: { owner, repo },
      path: `/${owner}/${repo}`,
    });
    window.history.pushState({}, '', `/${owner}/${repo}`);
  }

  function goHome() {
    setRoute({
      view: 'home',
      repoInfo: null,
      path: '/',
    });
    window.history.pushState({}, '', '/');
  }

  function goTo404(path = '/404') {
    setRoute({
      view: '404',
      repoInfo: null,
      path,
    });
    window.history.pushState({}, '', path.startsWith('/') ? path : `/${path}`);
  }

  // Handle browser back and forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseCurrentRoute());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (route.view === 'repo' && route.repoInfo) {
    return (
      <>
        <RepoPage
          owner={route.repoInfo.owner}
          repo={route.repoInfo.repo}
          onHome={goHome}
          onNavigate={navigate}
          onNotFound={() => goTo404(`/${route.repoInfo.owner}/${route.repoInfo.repo}`)}
          user={user}
          onOpenLogin={() => setLoginOpen(true)}
          onLogout={handleLogout}
        />
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onAuthSuccess={setUser} />
      </>
    );
  }

  if (route.view === '404') {
    return (
      <>
        <NotFoundPage
          onHome={goHome}
          onNavigate={navigate}
          attemptedPath={route.path !== '/404' ? route.path : ''}
        />
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onAuthSuccess={setUser} />
      </>
    );
  }

  return (
    <>
      <HomePage
        onNavigate={navigate}
        user={user}
        onOpenLogin={() => setLoginOpen(true)}
        onLogout={handleLogout}
      />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onAuthSuccess={setUser} />
    </>
  );
}
