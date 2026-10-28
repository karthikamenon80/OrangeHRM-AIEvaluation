import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where an input came from, so the dashboard can say how fresh each number is. */
export interface SourceInfo {
  path: string;
  /** ISO time the data was produced (from the file itself when it records one, else file mtime). */
  asOf: string;
  /** True when the gate fell back to a committed snapshot instead of a fresh run. */
  snapshot: boolean;
}

const rel = (p: string) => path.relative(REPO_ROOT, p).replace(/\\/g, '/');

function firstExisting(candidates: string[]): { file: string; snapshot: boolean } | null {
  for (const [i, file] of candidates.entries()) {
    if (existsSync(file)) return { file, snapshot: i > 0 };
  }
  return null;
}

// ---------------------------------------------------------------- Day 3

export interface SpecGap {
  category: string;
  reference: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export interface SpecReview {
  slug: string;
  score: number;
  summary: string;
  gaps: SpecGap[];
}

/**
 * Reads the AI spec reviewer's per-feature JSON. Prefers a fresh run
 * (tools/spec-reviewer/reports, gitignored) and falls back to the committed
 * baseline so the gate also works on a clean checkout.
 */
export function loadSpecReviews(dir?: string): { reviews: SpecReview[]; source: SourceInfo } {
  const candidates = dir
    ? [path.resolve(dir)]
    : [path.join(REPO_ROOT, 'tools/spec-reviewer/reports'), path.join(REPO_ROOT, 'tools/spec-reviewer/baseline-reports')];
  const found = candidates.find((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.json')));
  if (!found) throw new Error(`No spec review JSON found in: ${candidates.map(rel).join(', ')}`);

  const files = readdirSync(found).filter((f) => f.endsWith('.json')).sort();
  const reviews = files.map((f) => {
    const data = JSON.parse(readFileSync(path.join(found, f), 'utf8')) as Omit<SpecReview, 'slug'>;
    return { slug: f.replace(/\.json$/, ''), ...data };
  });
  const newest = Math.max(...files.map((f) => statSync(path.join(found, f)).mtimeMs));
  return {
    reviews,
    source: { path: rel(found), asOf: new Date(newest).toISOString(), snapshot: found !== candidates[0] },
  };
}

// ---------------------------------------------------------------- Day 2

export type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped';

export interface TestResult {
  /** Spec file path relative to the Playwright testDir, e.g. "leave-approval-workflow.spec.ts". */
  file: string;
  title: string;
  status: TestStatus;
  durationMs: number;
  error?: string;
}

interface PwSuite {
  title: string;
  file?: string;
  specs?: { title: string; file: string; tests: { status: string; results: { duration: number; status: string; error?: { message?: string } }[] }[] }[];
  suites?: PwSuite[];
}

function mapStatus(s: string): TestStatus {
  if (s === 'expected') return 'passed';
  if (s === 'flaky') return 'flaky';
  if (s === 'skipped') return 'skipped';
  return 'failed';
}

// Playwright error messages carry ANSI colour codes; strip them for HTML.
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

/** First line of the error plus its Expected/Received lines: the part that says what actually differed. */
function summarizeError(message: string): string {
  const lines = stripAnsi(message).split('\n').map((l) => l.trim()).filter(Boolean);
  const detail = lines.filter((l) => /^(Expected|Received)\b/.test(l)).map((l) => l.replace(/\s{2,}/g, ' '));
  return [lines[0], ...detail].join(' · ');
}

/** Reads Playwright's JSON reporter output (tests/playwright/results/results.json). */
export function loadPlaywright(file?: string): { tests: TestResult[]; source: SourceInfo } {
  const target = file ? path.resolve(file) : path.join(REPO_ROOT, 'tests/playwright/results/results.json');
  if (!existsSync(target)) {
    throw new Error(`No Playwright JSON report at ${rel(target)}. Run the suite first: cd tests/playwright && npx playwright test`);
  }
  const report = JSON.parse(readFileSync(target, 'utf8')) as { suites: PwSuite[]; stats?: { startTime?: string } };
  const tests: TestResult[] = [];
  const walk = (suite: PwSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const last = t.results[t.results.length - 1];
        const failure = t.results.find((r) => r.error?.message)?.error?.message;
        tests.push({
          file: spec.file,
          title: spec.title,
          status: mapStatus(t.status),
          durationMs: t.results.reduce((sum, r) => sum + r.duration, 0),
          error: last && last.status !== 'passed' && failure ? summarizeError(failure) : undefined,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of report.suites) walk(s);
  return {
    tests,
    source: { path: rel(target), asOf: report.stats?.startTime ?? statSync(target).mtime.toISOString(), snapshot: false },
  };
}

// ---------------------------------------------------------------- Day 4-5

export interface EvalEntryResult {
  entry: { id: string; label: string; prompt: string; response: string; feature?: string };
  flags: string[];
  scores: { accuracy: number; relevance: number; groundedness: number; hallucination: boolean; safety: 'safe' | 'unsafe' };
  verification?: { required: string[]; forbidden: string[]; passed: boolean };
}

export interface EvalRun {
  generatedAt: string;
  judge: { enabled: boolean; model: string | null };
  results: EvalEntryResult[];
  summary: {
    entries: number;
    meanScores: { accuracy: number; relevance: number; groundedness: number };
    hallucinationRate: number;
    safetyPassRate: number;
  };
  verification: { method: string; available: boolean; entriesPassed: number; entriesTotal: number }[];
}

/**
 * Reads the evaluation platform's results. Prefers a fresh run
 * (eval-platform/reports, gitignored), then the newest committed demo
 * snapshot. Feature tags are joined from the dataset by id, so snapshots made
 * before an entry was tagged still trace correctly.
 */
export function loadEvaluation(file?: string): { run: EvalRun; source: SourceInfo } {
  const demoDir = path.join(REPO_ROOT, 'eval-platform/demo-reports');
  const snapshots = existsSync(demoDir)
    ? readdirSync(demoDir).filter((d) => existsSync(path.join(demoDir, d, 'results.json'))).sort().reverse()
    : [];
  const candidates = file
    ? [path.resolve(file)]
    : [path.join(REPO_ROOT, 'eval-platform/reports/results.json'), ...snapshots.map((d) => path.join(demoDir, d, 'results.json'))];
  const found = firstExisting(candidates);
  if (!found) throw new Error(`No evaluation results found in: ${candidates.map(rel).join(', ')}`);

  const run = JSON.parse(readFileSync(found.file, 'utf8')) as EvalRun;
  const datasetPath = path.join(REPO_ROOT, 'eval-platform/data/dataset.json');
  if (existsSync(datasetPath)) {
    const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as { entries: { id: string; feature?: string }[] };
    const features = new Map(dataset.entries.map((e) => [e.id, e.feature]));
    for (const r of run.results) r.entry.feature ??= features.get(r.entry.id);
  }
  return { run, source: { path: rel(found.file), asOf: run.generatedAt, snapshot: found.snapshot } };
}
