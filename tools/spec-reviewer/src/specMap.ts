import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { FeatureTarget } from './types.js';

// tools/spec-reviewer/src -> repo root is two levels up.
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const CHANGES_DIR = path.join(REPO_ROOT, 'openspec', 'changes');
const TESTS_DIR = path.join(REPO_ROOT, 'tests', 'playwright', 'tests');

/**
 * Feature slugs are shared by convention between
 * openspec/changes/<slug>/spec.md and tests/playwright/tests/<slug>.spec.ts.
 * This is a project-specific naming convention (not something the Claude API
 * infers) — it's how the reviewer knows which test file "corresponds to"
 * which spec, per the Day 3 brief.
 */
export function discoverAllFeatures(): FeatureTarget[] {
  if (!existsSync(CHANGES_DIR)) {
    return [];
  }
  return readdirSync(CHANGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => featureForSlug(entry.name))
    .filter((feature): feature is FeatureTarget => feature !== null);
}

export function featureForSlug(slug: string): FeatureTarget | null {
  const specPath = path.join(CHANGES_DIR, slug, 'spec.md');
  if (!existsSync(specPath)) {
    return null;
  }
  const testPath = path.join(TESTS_DIR, `${slug}.spec.ts`);
  const testPaths = existsSync(testPath) ? [testPath] : [];
  return { slug, specPath, testPaths };
}

/**
 * Maps a set of changed file paths (as reported by `git diff`, repo-relative
 * or absolute) to the feature slugs they affect, so the reviewer only
 * re-reviews specs actually touched by a push/PR rather than all of them.
 */
export function slugsForChangedFiles(changedFiles: string[]): string[] {
  const slugs = new Set<string>();
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, '/');
    const specMatch = normalized.match(/openspec\/changes\/([^/]+)\/spec\.md$/);
    if (specMatch) {
      slugs.add(specMatch[1]);
      continue;
    }
    const testMatch = normalized.match(/tests\/playwright\/tests\/([^/]+)\.spec\.ts$/);
    if (testMatch) {
      slugs.add(testMatch[1]);
    }
  }
  return [...slugs];
}
