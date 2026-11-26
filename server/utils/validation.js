import { z } from 'zod';

// GitHub username/org: 1-39 chars, alphanumeric or single internal hyphens
export const OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

// GitHub repo name: 1-100 chars of [a-zA-Z0-9._-], not "." or "..", no ".." traversal
export const REPO_REGEX = /^(?!\.\.?$)(?!.*\.\.)[a-zA-Z0-9._-]{1,100}$/;

export const BRANCH_REGEX = /^(?!.*\.\.)[a-zA-Z0-9._/-]{1,200}$/;
export const NODE_ID_REGEX = /^[a-zA-Z0-9._:/-]{1,128}$/;

export const ownerSchema = z
  .string({ required_error: 'owner is required' })
  .trim()
  .regex(OWNER_REGEX, 'Invalid repository owner format');

export const repoSchema = z
  .string({ required_error: 'repo is required' })
  .trim()
  .regex(REPO_REGEX, 'Invalid repository name format');

export const branchSchema = z
  .string()
  .trim()
  .regex(BRANCH_REGEX, 'Invalid branch format');

export const nodeIdSchema = z
  .string()
  .trim()
  .regex(NODE_ID_REGEX, 'Invalid nodeId format');

export const diagramRequestSchema = z
  .object({
    owner: ownerSchema,
    repo: repoSchema,
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

export const chatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1, 'Message cannot be empty').max(4000, 'Message too long'),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    owner: ownerSchema,
    repo: repoSchema,
    branch: branchSchema.optional(),
    nodeId: nodeIdSchema.optional().nullable(),
    messages: z
      .array(chatMessageSchema)
      .min(1, 'At least one message is required')
      .max(30, 'Too many messages in history'),
  })
  .strict();

export const historyRequestSchema = z
  .object({
    owner: ownerSchema,
    repo: repoSchema,
  })
  .strict();

/**
 * Parse a GitHub repository URL or "owner/repo" shorthand into { owner, repo }.
 * Strictly enforces OWNER_REGEX and REPO_REGEX and rejects non-GitHub hosts.
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
