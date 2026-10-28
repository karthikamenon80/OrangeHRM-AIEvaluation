import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDashboard } from './dashboard.js';
import { computeMetrics, runChecks, type Thresholds } from './gate.js';
import { loadEvaluation, loadPlaywright, loadSpecReviews } from './sources.js';
import { traceFeature } from './traceability.js';

const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: string[]) {
  const opts = {
    specDir: undefined as string | undefined,
    playwright: undefined as string | undefined,
    evaluation: undefined as string | undefined,
    thresholds: path.join(HERE, 'thresholds.json'),
    feature: 'leave-approval-workflow',
    out: path.join(HERE, 'out'),
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--spec-dir': opts.specDir = next(); break;
      case '--playwright': opts.playwright = next(); break;
      case '--eval': opts.evaluation = next(); break;
      case '--thresholds': opts.thresholds = path.resolve(next()); break;
      case '--feature': opts.feature = next(); break;
      case '--out': opts.out = path.resolve(next()); break;
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const thresholds = JSON.parse(readFileSync(opts.thresholds, 'utf8')) as Thresholds;

  const spec = loadSpecReviews(opts.specDir);
  const pw = loadPlaywright(opts.playwright);
  const ev = loadEvaluation(opts.evaluation);

  const metrics = computeMetrics(spec.reviews, pw.tests, ev.run);
  const checks = runChecks(metrics, thresholds);
  const passed = checks.every((c) => c.passed);
  const trace = traceFeature(opts.feature, spec.reviews, pw.tests, ev.run);
  const sources = { specReview: spec.source, playwright: pw.source, evaluation: ev.source };
  const generatedAt = new Date().toISOString();

  mkdirSync(opts.out, { recursive: true });
  writeFileSync(
    path.join(opts.out, 'gate-result.json'),
    JSON.stringify({ generatedAt, passed, checks, metrics, thresholds, sources, trace }, null, 2)
  );
  writeFileSync(
    path.join(opts.out, 'dashboard.html'),
    renderDashboard({ generatedAt, passed, checks, metrics, thresholds, tests: pw.tests, trace, sources })
  );

  console.log(`\nQuality gate: ${passed ? 'PASS' : 'FAIL'}\n`);
  for (const c of checks) {
    console.log(`  ${c.passed ? 'PASS' : 'FAIL'}  ${c.area.padEnd(12)} ${c.name.padEnd(42)} ${c.actual.padEnd(14)} (needs ${c.threshold})`);
  }
  for (const [name, s] of Object.entries(sources)) {
    console.log(`  source ${name}: ${s.path}${s.snapshot ? ' (committed snapshot)' : ''}`);
  }
  console.log(`\nWrote ${path.join(opts.out, 'gate-result.json')} and ${path.join(opts.out, 'dashboard.html')}`);
  if (!passed) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 2;
}
