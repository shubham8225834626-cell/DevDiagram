import { useState } from 'react';
import HomePage from './pages/HomePage.jsx';
import RepoPage from './pages/RepoPage.jsx';

/**
 * Minimal router using plain state — no react-router needed for this MVP.
 * state.view = 'home' | 'repo'
 */
export default function App() {
  const [view, setView] = useState('home');
  const [repoInfo, setRepoInfo] = useState(null); // { owner, repo }

  function navigate(owner, repo) {
    setRepoInfo({ owner, repo });
    setView('repo');
    // Update URL bar for shareability without a full router
    window.history.pushState({}, '', `/${owner}/${repo}`);
  }

  function goHome() {
    setView('home');
    setRepoInfo(null);
    window.history.pushState({}, '', '/');
  }

  // Handle browser back button
  window.onpopstate = () => {
    const path = window.location.pathname.replace(/^\//, '');
    const parts = path.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      setRepoInfo({ owner: parts[0], repo: parts[1] });
      setView('repo');
    } else {
      goHome();
    }
  };

  if (view === 'repo' && repoInfo) {
    return <RepoPage owner={repoInfo.owner} repo={repoInfo.repo} onHome={goHome} />;
  }

  return <HomePage onNavigate={navigate} />;
}
