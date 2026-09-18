import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './specMap.js';

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

/**
 * Figures out which files changed so the Action only reviews the specs a
 * push/PR actually touched. On a PR, diffs against the PR's base ref
 * (GITHUB_BASE_REF, set by GitHub Actions for pull_request events). Outside
 * of a PR (e.g. a push), falls back to comparing against the previous commit.
 */
export function getChangedFiles(): string[] {
  const baseRef = process.env.GITHUB_BASE_REF;
  try {
    if (baseRef) {
      git(['fetch', '--depth=1', 'origin', baseRef]);
      const diff = git(['diff', '--name-only', `origin/${baseRef}...HEAD`]);
      return diff.split('\n').filter(Boolean);
    }
    const diff = git(['diff', '--name-only', 'HEAD~1...HEAD']);
    return diff.split('\n').filter(Boolean);
  } catch {
    // Shallow clone with no parent commit, detached HEAD, etc. — caller
    // should fall back to reviewing everything rather than nothing.
    return [];
  }
}
