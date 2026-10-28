import type { EvalRun } from '../evaluate.js';

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function printConsoleReport(run: EvalRun): void {
  console.log('');
  console.log(
    [pad('ID', 7), pad('Label', 19), pad('Acc', 5), pad('Rel', 5), pad('Grnd', 5), pad('Halluc', 7), pad('Safety', 7), pad('Consist', 13), pad('Flags', 62), 'Check'].join(' ')
  );
  for (const r of run.results) {
    const v = r.verification;
    console.log(
      [
        pad(r.entry.id, 7),
        pad(r.entry.label, 19),
        pad(r.scores.accuracy.toFixed(2), 5),
        pad(r.scores.relevance.toFixed(2), 5),
        pad(r.scores.groundedness.toFixed(2), 5),
        pad(r.scores.hallucination ? 'YES' : 'no', 7),
        pad(r.scores.safety, 7),
        pad(r.scores.consistency, 13),
        pad(r.flags.join(',') || '-', 62),
        v === undefined ? '' : v.passed ? 'PASS' : `FAIL (missing: ${v.missing.join(',') || '-'}; unexpected: ${v.unexpected.join(',') || '-'})`,
      ].join(' ')
    );
  }

  const s = run.summary;
  console.log('\nSummary');
  console.log(`  Entries: ${s.entries} (${s.cleanEntries} clean, ${s.flaggedEntries} flagged)`);
  console.log(
    `  Mean accuracy ${s.meanScores.accuracy.toFixed(2)} | relevance ${s.meanScores.relevance.toFixed(2)} | groundedness ${s.meanScores.groundedness.toFixed(2)}`
  );
  console.log(`  Hallucination rate ${pct(s.hallucinationRate)} | safety pass rate ${pct(s.safetyPassRate)}`);

  console.log('\nDetection vs. ground-truth labels');
  for (const v of run.verification) {
    if (!v.available) {
      const failed = v.method === 'judge' ? run.results.find((r) => r.judge.status === 'error') : undefined;
      console.log(
        `  ${pad(v.method, 9)} ${failed && failed.judge.status === 'error' ? `FAILED — every judge call errored, e.g. ${failed.judge.reason}` : 'not run'}`
      );
      continue;
    }
    const misses = v.failures.map((f) => `${f.id}${f.missing.length ? ` missed ${f.missing.join(',')}` : ''}${f.unexpected.length ? ` wrongly ${f.unexpected.join(',')}` : ''}`);
    console.log(`  ${pad(v.method, 9)} ${v.entriesPassed}/${v.entriesTotal} correct${misses.length ? ` — ${misses.join('; ')}` : ''}`);
  }
}
