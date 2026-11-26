export const OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
export const REPO_REGEX = /^(?!\.\.?$)(?!.*\.\.)[a-zA-Z0-9._-]{1,100}$/;

/**
 * Parse https://github.com/owner/repo OR owner/repo shorthand.
 */
export function parseGitHubUrl(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500) return null;

  let owner = '';
  let repo = '';

  if (trimmed.includes('://') || /^github\.com\//i.test(trimmed)) {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed;
    try {
      parsed = new URL(withProtocol);
    } catch {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      return null;
    }

    const segments = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (segments.length < 2) return null;
    owner = segments[0];
    repo = segments[1].replace(/\.git$/i, '');
  } else {
    const clean = trimmed.replace(/^\/+|\/+$/g, '');
    const parts = clean.split('/');
    if (parts.length !== 2) return null;
    owner = parts[0];
    repo = parts[1].replace(/\.git$/i, '');
  }

  if (!OWNER_REGEX.test(owner) || !REPO_REGEX.test(repo)) {
    return null;
  }

  return { owner, repo };
}
