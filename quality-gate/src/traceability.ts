import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './sources.js';
import type { EvalEntryResult, EvalRun, SpecGap, SpecReview, TestResult } from './sources.js';

export interface TracedTest {
  title: string;
  /** AC ids the test declares it covers. */
  covers: string[];
  status: TestResult['status'] | 'not run';
  durationMs?: number;
  error?: string;
}

export interface TracedCriterion {
  id: string;
  text: string;
  tests: TracedTest[];
  reviewGaps: SpecGap[];
  /**
   * covered = every citing test passed; failing = a citing test failed;
   * unverified = citing tests were skipped or not run; uncovered = no test cites it.
   */
  status: 'covered' | 'failing' | 'unverified' | 'uncovered';
}

export interface FeatureTrace {
  slug: string;
  title: string;
  specPath: string;
  testPath: string;
  criteria: TracedCriterion[];
  /** Review gaps not tied to a single AC (edge cases etc.). */
  otherGaps: SpecGap[];
  review: { score: number; summary: string } | null;
  evalEntries: EvalEntryResult[];
}

const AC_RE = /AC-\d+/g;

/** "1. **AC-1**: Given ..." items from the spec's Acceptance criteria section. */
function parseCriteria(specMarkdown: string): { id: string; text: string }[] {
  const section = specMarkdown.split(/^## Acceptance criteria\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const items: { id: string; text: string }[] = [];
  for (const block of section.split(/^\d+\.\s+/m).slice(1)) {
    const m = block.match(/^\*\*(AC-\d+)\*\*:\s*([\s\S]*)$/);
    if (m) items.push({ id: m[1], text: m[2].replace(/\s+/g, ' ').trim() });
  }
  return items;
}

/**
 * Finds each test() and the ACs it declares: the "AC-n/AC-m:" prefix of its
 * title plus the "// Spec AC-n" lines in the comment block directly above
 * it. Only the leading id list of a "Spec" line counts, so a comment that
 * mentions another AC in passing ("per the AC-4/AC-2 correction") is not
 * mistaken for a coverage claim.
 */
function parseTests(source: string): { title: string; covers: string[] }[] {
  const lines = source.split(/\r?\n/);
  const tests: { title: string; covers: string[] }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*test\(\s*(['"`])(.+?)\1/);
    if (!m) return;
    const covers = new Set<string>();
    const titlePrefix = m[2].match(/^((?:AC-\d+\/?)+):/);
    if (titlePrefix) for (const id of titlePrefix[1].match(AC_RE) ?? []) covers.add(id);
    for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) {
      const spec = lines[j].match(/^\s*\/\/\s*Spec\s+((?:AC-\d+\/?)+)/);
      if (spec) for (const id of spec[1].match(AC_RE) ?? []) covers.add(id);
    }
    tests.push({ title: m[2], covers: [...covers].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))) });
  });
  return tests;
}

export function traceFeature(slug: string, reviews: SpecReview[], results: TestResult[], evalRun: EvalRun): FeatureTrace {
  const specPath = path.join(REPO_ROOT, 'openspec/changes', slug, 'spec.md');
  const testPath = path.join(REPO_ROOT, 'tests/playwright/tests', `${slug}.spec.ts`);
  if (!existsSync(specPath)) throw new Error(`No spec for feature "${slug}" at ${specPath}`);
  const specMarkdown = readFileSync(specPath, 'utf8');
  const testSource = existsSync(testPath) ? readFileSync(testPath, 'utf8') : '';

  const fileResults = results.filter((r) => path.basename(r.file) === `${slug}.spec.ts`);
  const tests: TracedTest[] = parseTests(testSource).map((t) => {
    const r = fileResults.find((x) => x.title === t.title);
    return { ...t, status: r?.status ?? 'not run', durationMs: r?.durationMs, error: r?.error };
  });

  const review = reviews.find((r) => r.slug === slug) ?? null;
  const gaps = review?.gaps ?? [];
  const criteria: TracedCriterion[] = parseCriteria(specMarkdown).map(({ id, text }) => {
    const citing = tests.filter((t) => t.covers.includes(id));
    const status: TracedCriterion['status'] =
      citing.length === 0
        ? 'uncovered'
        : citing.some((t) => t.status === 'failed')
          ? 'failing'
          : citing.every((t) => t.status === 'passed' || t.status === 'flaky')
            ? 'covered'
            : 'unverified';
    return { id, text, tests: citing, reviewGaps: gaps.filter((g) => g.reference === id), status };
  });
  const acIds = new Set(criteria.map((c) => c.id));

  return {
    slug,
    title: specMarkdown.match(/^#\s+(?:Spec:\s*)?(.+)$/m)?.[1].trim() ?? slug,
    specPath: path.relative(REPO_ROOT, specPath).replace(/\\/g, '/'),
    testPath: path.relative(REPO_ROOT, testPath).replace(/\\/g, '/'),
    criteria,
    otherGaps: gaps.filter((g) => !acIds.has(g.reference)),
    review: review ? { score: review.score, summary: review.summary } : null,
    evalEntries: evalRun.results.filter((r) => r.entry.feature === slug),
  };
}
