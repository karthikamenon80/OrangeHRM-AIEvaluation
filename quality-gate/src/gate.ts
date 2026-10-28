import type { EvalRun, SpecReview, TestResult } from './sources.js';

export interface Thresholds {
  specReview: { minScorePerFeature: number };
  playwright: { minPassRate: number };
  evaluation: { minSafetyDetection: number; minLabelAgreement: number };
}

export interface GateCheck {
  id: string;
  /** Which of the three inputs this check is about. */
  area: 'Spec review' | 'Playwright' | 'Evaluation';
  name: string;
  actual: string;
  threshold: string;
  passed: boolean;
  /** Why it failed (or a note when it passed with caveats). */
  detail: string;
}

export interface GateMetrics {
  playwright: { total: number; passed: number; failed: number; flaky: number; skipped: number; passRate: number };
  specScores: { slug: string; score: number; gaps: number; highGaps: number }[];
  evaluation: {
    entries: number;
    labelAgreement: number;
    safetyDetection: number;
    missedUnsafe: string[];
    falseUnsafe: string[];
    meanAccuracy: number;
    meanRelevance: number;
    meanGroundedness: number;
    hallucinationRate: number;
    safetyPassRate: number;
    judgeModel: string | null;
  };
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export function computeMetrics(reviews: SpecReview[], tests: TestResult[], evalRun: EvalRun): GateMetrics {
  // Skipped tests count as not passed: in a serial suite they are usually
  // skipped *because* an earlier test failed, so excluding them would
  // overstate the pass rate.
  const passed = tests.filter((t) => t.status === 'passed' || t.status === 'flaky').length;

  const labelled = evalRun.results.filter((r) => r.verification);
  const combined = evalRun.verification.find((v) => v.method === 'combined');
  // Safety detection: the label says whether the response is unsafe (it
  // requires the `unsafe` flag); the platform's verdict must match it.
  const expectedUnsafe = (r: (typeof labelled)[number]) => r.verification!.required.includes('unsafe');
  const missedUnsafe = labelled.filter((r) => expectedUnsafe(r) && r.scores.safety !== 'unsafe').map((r) => r.entry.id);
  const falseUnsafe = labelled.filter((r) => !expectedUnsafe(r) && r.scores.safety === 'unsafe').map((r) => r.entry.id);

  return {
    playwright: {
      total: tests.length,
      passed,
      failed: tests.filter((t) => t.status === 'failed').length,
      flaky: tests.filter((t) => t.status === 'flaky').length,
      skipped: tests.filter((t) => t.status === 'skipped').length,
      passRate: tests.length === 0 ? 0 : passed / tests.length,
    },
    specScores: reviews.map((r) => ({
      slug: r.slug,
      score: r.score,
      gaps: r.gaps.length,
      highGaps: r.gaps.filter((g) => g.severity === 'high').length,
    })),
    evaluation: {
      entries: evalRun.results.length,
      labelAgreement: combined && combined.entriesTotal > 0 ? combined.entriesPassed / combined.entriesTotal : 0,
      safetyDetection: labelled.length === 0 ? 0 : 1 - (missedUnsafe.length + falseUnsafe.length) / labelled.length,
      missedUnsafe,
      falseUnsafe,
      meanAccuracy: evalRun.summary.meanScores.accuracy,
      meanRelevance: evalRun.summary.meanScores.relevance,
      meanGroundedness: evalRun.summary.meanScores.groundedness,
      hallucinationRate: evalRun.summary.hallucinationRate,
      safetyPassRate: evalRun.summary.safetyPassRate,
      judgeModel: evalRun.judge.model,
    },
  };
}

export function runChecks(m: GateMetrics, t: Thresholds): GateCheck[] {
  const checks: GateCheck[] = [];

  for (const s of m.specScores) {
    checks.push({
      id: `spec-${s.slug}`,
      area: 'Spec review',
      name: `${s.slug} spec review score`,
      actual: `${s.score}/10`,
      threshold: `≥ ${t.specReview.minScorePerFeature}/10`,
      passed: s.score >= t.specReview.minScorePerFeature,
      detail: `${s.gaps} coverage gaps reported (${s.highGaps} high severity).`,
    });
  }

  const pw = m.playwright;
  checks.push({
    id: 'playwright-pass-rate',
    area: 'Playwright',
    name: 'Playwright pass rate',
    actual: `${pct(pw.passRate)} (${pw.passed}/${pw.total})`,
    threshold: `≥ ${pct(t.playwright.minPassRate)}`,
    passed: pw.total > 0 && pw.passRate >= t.playwright.minPassRate,
    detail:
      pw.total === 0
        ? 'No tests ran.'
        : [
            pw.failed ? `${pw.failed} failed` : '',
            pw.flaky ? `${pw.flaky} flaky (passed on retry)` : '',
            pw.skipped ? `${pw.skipped} skipped (not run, counted as not passed)` : '',
          ].filter(Boolean).join(', ') || 'All tests passed.',
  });

  const ev = m.evaluation;
  checks.push({
    id: 'eval-safety-detection',
    area: 'Evaluation',
    name: 'Safety detection',
    actual: pct(ev.safetyDetection),
    threshold: `≥ ${pct(t.evaluation.minSafetyDetection)}`,
    passed: ev.safetyDetection >= t.evaluation.minSafetyDetection,
    detail:
      ev.missedUnsafe.length || ev.falseUnsafe.length
        ? `Missed unsafe: ${ev.missedUnsafe.join(', ') || 'none'}; false alarms: ${ev.falseUnsafe.join(', ') || 'none'}.`
        : 'Every unsafe response was flagged and no safe one was.',
  });
  checks.push({
    id: 'eval-label-agreement',
    area: 'Evaluation',
    name: 'Flags match ground-truth labels',
    actual: pct(ev.labelAgreement),
    threshold: `≥ ${pct(t.evaluation.minLabelAgreement)}`,
    passed: ev.labelAgreement >= t.evaluation.minLabelAgreement,
    detail: ev.judgeModel ? `Rules + Claude judge (${ev.judgeModel}).` : 'Rules only: the AI judge did not run.',
  });

  return checks;
}
