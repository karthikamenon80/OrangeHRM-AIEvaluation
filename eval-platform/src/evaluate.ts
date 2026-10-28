import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeJudge, DEFAULT_MODEL, judgeCredentialsAvailable } from './judge.js';
import { printConsoleReport } from './report/console.js';
import { renderHtmlReport } from './report/html.js';
import { ACCURACY_THRESHOLD, scoreAccuracy } from './scorers/accuracy.js';
import { checkConsistency } from './scorers/consistency.js';
import { detectHallucination } from './scorers/hallucination.js';
import { RELEVANCE_THRESHOLD, scoreRelevance } from './scorers/relevance.js';
import { checkSafety } from './scorers/safety.js';
import { round } from './text.js';
import type {
  Dataset,
  DatasetEntry,
  EntryResult,
  Flag,
  GroupJudgeOutcome,
  JudgeOutcome,
  KnowledgeBase,
  MethodVerification,
  RuleScores,
} from './types.js';
import { verifyFlags, verifyMethod } from './verify.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface EvalRun {
  generatedAt: string;
  datasetPath: string;
  judge: { enabled: boolean; model: string | null; note: string };
  thresholds: { accuracy: number; relevance: number };
  results: EntryResult[];
  groupJudgements: GroupJudgeOutcome[];
  summary: Summary;
  verification: MethodVerification[];
}

export interface Summary {
  entries: number;
  cleanEntries: number;
  flaggedEntries: number;
  meanScores: { accuracy: number; relevance: number; groundedness: number };
  hallucinationRate: number;
  safetyPassRate: number;
  flagCounts: Record<Flag, string[]>;
}

function parseArgs(argv: string[]) {
  const opts = {
    dataset: path.join(ROOT, 'data', 'dataset.json'),
    kb: path.join(ROOT, 'data', 'policy-kb.json'),
    out: path.join(ROOT, 'reports'),
    judge: true,
    model: process.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
    concurrency: 4,
    prompt: undefined as string | undefined,
    response: undefined as string | undefined,
    reference: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--dataset') opts.dataset = path.resolve(next());
    else if (arg === '--kb') opts.kb = path.resolve(next());
    else if (arg === '--out') opts.out = path.resolve(next());
    else if (arg === '--no-judge') opts.judge = false;
    else if (arg === '--model') opts.model = next();
    else if (arg === '--concurrency') opts.concurrency = Math.max(1, Number(next()));
    else if (arg === '--prompt') opts.prompt = next();
    else if (arg === '--response') opts.response = next();
    else if (arg === '--reference') opts.reference = next();
  }
  return opts;
}

function loadDataset(opts: ReturnType<typeof parseArgs>): Dataset {
  if (opts.prompt !== undefined || opts.response !== undefined || opts.reference !== undefined) {
    if (!opts.prompt || !opts.response || !opts.reference) {
      throw new Error('Single-entry mode needs all three of --prompt, --response and --reference.');
    }
    return {
      entries: [{ id: 'ADHOC-1', label: 'unlabeled', prompt: opts.prompt, response: opts.response, reference: opts.reference }],
    };
  }
  return JSON.parse(readFileSync(opts.dataset, 'utf8')) as Dataset;
}

function contextFor(entry: DatasetEntry, kb: KnowledgeBase): string {
  return (entry.contextIds ?? [])
    .map((id) => kb.sections.find((s) => s.id === id))
    .filter((s) => s !== undefined)
    .map((s) => `${s.title}: ${s.text}`)
    .join('\n');
}

function ruleScores(entry: DatasetEntry, context: string): Omit<RuleScores, 'consistency' | 'flags'> {
  return {
    accuracy: scoreAccuracy(entry.response, entry.reference),
    relevance: scoreRelevance(entry.response, entry.prompt, entry.reference, context),
    hallucination: detectHallucination(entry.response, entry.reference, context),
    safety: checkSafety(entry.prompt, entry.response),
  };
}

function ruleFlags(s: RuleScores): Flag[] {
  const flags: Flag[] = [];
  // A correct refusal is supposed to diverge from a policy answer, so
  // accuracy/relevance aren't held against it — safety covers that case.
  const correctRefusal = s.safety.injectionDetected && s.safety.verdict === 'safe';
  if (!correctRefusal && s.accuracy.score < ACCURACY_THRESHOLD) flags.push('inaccurate');
  if (!correctRefusal && s.relevance.score < RELEVANCE_THRESHOLD) flags.push('irrelevant');
  if (s.hallucination.unsupportedFacts.length > 0) flags.push('hallucination');
  if (s.consistency && !s.consistency.consistent) flags.push('inconsistent');
  if (s.safety.verdict === 'unsafe') flags.push('unsafe');
  if (s.safety.injectionDetected) flags.push('injection_attempt');
  return flags;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

/** Rubric score 1-5 -> 0-1. */
const norm5 = (n: number) => (n - 1) / 4;

function summarize(results: EntryResult[]): Summary {
  const flagCounts = { inaccurate: [], irrelevant: [], hallucination: [], inconsistent: [], unsafe: [], injection_attempt: [] } as Record<Flag, string[]>;
  for (const r of results) for (const f of r.flags) flagCounts[f].push(r.entry.id);
  // injection_attempt describes the prompt, not the response, so it doesn't
  // by itself make an entry's response "flagged".
  const flagged = results.filter((r) => r.flags.some((f) => f !== 'injection_attempt'));
  return {
    entries: results.length,
    cleanEntries: results.length - flagged.length,
    flaggedEntries: flagged.length,
    meanScores: {
      accuracy: mean(results.map((r) => r.scores.accuracy)),
      relevance: mean(results.map((r) => r.scores.relevance)),
      groundedness: mean(results.map((r) => r.scores.groundedness)),
    },
    hallucinationRate: round(results.filter((r) => r.scores.hallucination).length / Math.max(1, results.length)),
    safetyPassRate: round(results.filter((r) => r.scores.safety === 'safe').length / Math.max(1, results.length)),
    flagCounts,
  };
}

export async function runEvaluation(argv: string[]): Promise<EvalRun> {
  const opts = parseArgs(argv);
  const dataset = loadDataset(opts);
  const kb = JSON.parse(readFileSync(opts.kb, 'utf8')) as KnowledgeBase;

  let judge: ClaudeJudge | null = null;
  let judgeNote: string;
  if (!opts.judge) {
    judgeNote = 'AI judge disabled with --no-judge; rule-based scorers only.';
  } else if (!judgeCredentialsAvailable()) {
    judgeNote = 'AI judge skipped: no Anthropic credentials found (set ANTHROPIC_API_KEY). Rule-based scorers only.';
  } else {
    judge = new ClaudeJudge(opts.model);
    judgeNote = `AI judge: ${opts.model}`;
  }
  console.log(`[eval] ${dataset.entries.length} entries — ${judgeNote}`);

  // Rule-based scoring is synchronous and deterministic.
  const consistency = checkConsistency(dataset.entries);
  const contexts = new Map(dataset.entries.map((e) => [e.id, contextFor(e, kb)]));
  const rules = new Map<string, RuleScores>();
  for (const e of dataset.entries) {
    const scores: RuleScores = { ...ruleScores(e, contexts.get(e.id)!), consistency: consistency.get(e.id), flags: [] };
    scores.flags = ruleFlags(scores);
    rules.set(e.id, scores);
  }

  // AI judge: one rubric call per entry plus one consistency call per group.
  const judged: JudgeOutcome[] = judge
    ? await mapWithConcurrency(dataset.entries, opts.concurrency, async (e) => {
        const outcome = await judge.judgeEntry(e, contexts.get(e.id)!);
        console.log(`[eval] judged ${e.id}: ${outcome.status === 'ok' ? 'ok' : `${outcome.status} — ${outcome.reason}`}`);
        return outcome;
      })
    : dataset.entries.map(() => ({ status: 'skipped' as const, reason: judgeNote }));

  const groups = new Map<string, DatasetEntry[]>();
  for (const e of dataset.entries) {
    if (e.consistencyGroup) groups.set(e.consistencyGroup, [...(groups.get(e.consistencyGroup) ?? []), e]);
  }
  const groupJudgements: GroupJudgeOutcome[] = [];
  for (const [group, members] of groups) {
    if (members.length < 2) continue;
    groupJudgements.push(
      judge
        ? await judge.judgeGroup(group, members)
        : { group, status: 'skipped', inconsistentIds: [], rationale: judgeNote }
    );
  }
  const judgeGroupFlags = new Map<string, Flag[]>();
  for (const g of groupJudgements) for (const id of g.inconsistentIds) judgeGroupFlags.set(id, ['inconsistent']);

  const results: EntryResult[] = dataset.entries.map((entry, i) => {
    const r = rules.get(entry.id)!;
    const j = judged[i];
    const jv = j.status === 'ok' ? j.verdict : null;
    const flags = [...new Set([...r.flags, ...(j.status === 'ok' ? j.flags : []), ...(judgeGroupFlags.get(entry.id) ?? [])])];
    // Headline scores: rule score alone, or the mean of rule and judge when
    // the judge ran (both are shown separately in the report).
    const blend = (rule: number, judgeScore: number | undefined) =>
      round(judgeScore === undefined ? rule : (rule + norm5(judgeScore)) / 2);
    const result: EntryResult = {
      entry,
      rules: r,
      judge: j,
      flags,
      scores: {
        accuracy: blend(r.accuracy.score, jv?.correctness),
        relevance: blend(r.relevance.score, jv?.relevance),
        groundedness: blend(r.hallucination.groundedness, jv?.groundedness),
        hallucination: flags.includes('hallucination'),
        safety: flags.includes('unsafe') ? 'unsafe' : 'safe',
        consistency: !entry.consistencyGroup || !r.consistency ? 'n/a' : flags.includes('inconsistent') ? 'inconsistent' : 'consistent',
      },
    };
    result.verification = verifyFlags(entry.label, flags);
    return result;
  });

  const verification = (['rules', 'judge', 'combined'] as const).map((m) => verifyMethod(results, m, judgeGroupFlags));

  const run: EvalRun = {
    generatedAt: new Date().toISOString(),
    datasetPath: path.relative(ROOT, opts.dataset) || opts.dataset,
    judge: { enabled: judge !== null, model: judge ? opts.model : null, note: judgeNote },
    thresholds: { accuracy: ACCURACY_THRESHOLD, relevance: RELEVANCE_THRESHOLD },
    results,
    groupJudgements,
    summary: summarize(results),
    verification,
  };

  mkdirSync(opts.out, { recursive: true });
  writeFileSync(path.join(opts.out, 'results.json'), JSON.stringify(run, null, 2));
  writeFileSync(path.join(opts.out, 'report.html'), renderHtmlReport(run));
  printConsoleReport(run);
  console.log(`\n[eval] Wrote ${path.join(opts.out, 'results.json')} and ${path.join(opts.out, 'report.html')}`);
  return run;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runEvaluation(process.argv.slice(2))
    .then((run) => {
      const combined = run.verification.find((v) => v.method === 'combined')!;
      // Labelled datasets double as a regression test for the evaluator itself.
      if (combined.failures.length > 0) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
