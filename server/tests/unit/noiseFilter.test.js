import { describe, it, expect } from 'vitest';
import { isIgnoredPath, assertAllowedGithubUrl } from '../../services/github.js';

describe('GitHub Noise Filter & Host Allowlist', () => {
  describe('isIgnoredPath', () => {
    it('filters out dependency directories, build artifacts, lockfiles, and binary assets', () => {
      expect(isIgnoredPath('node_modules/express/index.js')).toBe(true);
      expect(isIgnoredPath('client/node_modules/react/index.js')).toBe(true);
      expect(isIgnoredPath('.git/config')).toBe(true);
      expect(isIgnoredPath('dist/bundle.js')).toBe(true);
      expect(isIgnoredPath('coverage/lcov.info')).toBe(true);
      expect(isIgnoredPath('package-lock.json')).toBe(true);
      expect(isIgnoredPath('yarn.lock')).toBe(true);
      expect(isIgnoredPath('assets/logo.png')).toBe(true);
      expect(isIgnoredPath('public/vendor.min.js')).toBe(true);
      expect(isIgnoredPath('public/styles.css.map')).toBe(true);
      expect(isIgnoredPath('.DS_Store')).toBe(true);
      expect(isIgnoredPath('')).toBe(true);
    });

    it('keeps meaningful source, config, and documentation files', () => {
      expect(isIgnoredPath('src/index.js')).toBe(false);
      expect(isIgnoredPath('server/routes/diagram.js')).toBe(false);
      expect(isIgnoredPath('client/src/App.jsx')).toBe(false);
      expect(isIgnoredPath('package.json')).toBe(false);
      expect(isIgnoredPath('README.md')).toBe(false);
    });
  });

  describe('assertAllowedGithubUrl', () => {
    it('allows fixed HTTPS GitHub hosts only', () => {
      expect(assertAllowedGithubUrl('https://api.github.com/repos/facebook/react')).toBe(
        'https://api.github.com/repos/facebook/react'
      );
      expect(assertAllowedGithubUrl('https://raw.githubusercontent.com/facebook/react/main/README.md')).toBe(
        'https://raw.githubusercontent.com/facebook/react/main/README.md'
      );
    });

    it('rejects non-HTTPS schemes and arbitrary external or metadata hosts', () => {
      expect(() => assertAllowedGithubUrl('http://api.github.com/repos/a/b')).toThrow(/Disallowed host/);
      expect(() => assertAllowedGithubUrl('https://evil.example.com/repos/a/b')).toThrow(/Disallowed host/);
      expect(() => assertAllowedGithubUrl('http://169.254.169.254/latest/meta-data')).toThrow(/Disallowed host/);
      expect(() => assertAllowedGithubUrl('https://localhost:3001/api')).toThrow(/Disallowed host/);
    });
  });
});
