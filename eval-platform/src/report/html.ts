import type { EvalRun } from '../evaluate.js';
import type { EntryResult, Flag } from '../types.js';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (n: number) => `${Math.round(n * 100)}%`;

const FLAG_TONE: Record<Flag, string> = {
  inaccurate: 'warn',
  incomplete: 'warn',
  irrelevant: 'warn',
  hallucination: 'bad',
  inconsistent: 'warn',
  unsafe: 'bad',
  injection_attempt: 'info',
};

function scoreCell(value: number, rule: number, judge: number | undefined): string {
  const tone = value >= 0.7 ? 'good' : value >= 0.45 ? 'warn' : 'bad';
  const detail = judge === undefined ? `rule ${rule.toFixed(2)}` : `rule ${rule.toFixed(2)} · judge ${judge}/5`;
  return `<td class="num"><div class="score ${tone}"><span class="bar" style="width:${Math.round(value * 100)}%"></span><b>${value.toFixed(2)}</b></div><small>${detail}</small></td>`;
}

function entryRow(r: EntryResult): string {
  const jv = r.judge.status === 'ok' ? r.judge.verdict : undefined;
  const v = r.verification;
  const check = v === undefined ? '<span class="muted">n/a</span>' : v.passed
    ? '<span class="pill good">PASS</span>'
    : `<span class="pill bad">FAIL</span><small>${v.missing.length ? `missed ${v.missing.join(', ')}` : ''}${v.unexpected.length ? ` wrongly ${v.unexpected.join(', ')}` : ''}</small>`;
  const flags = r.flags.length
    ? r.flags.map((f) => `<span class="pill ${FLAG_TONE[f]}">${f.replace('_', ' ')}</span>`).join(' ')
    : '<span class="muted">none</span>';

  const rules = r.rules;
  const details = [
    ['Prompt', r.entry.prompt],
    ['Reference', r.entry.reference],
    ['Response', r.entry.response],
  ]
    .map(([k, val]) => `<dt>${k}</dt><dd><pre>${esc(val)}</pre></dd>`)
    .join('');
  const ruleNotes = [
    `Facts in reference: ${rules.accuracy.referenceFacts.join(', ') || 'none'}; in response: ${rules.accuracy.responseFacts.join(', ') || 'none'} (recall ${rules.accuracy.factRecall}, lexical similarity ${rules.accuracy.lexicalSimilarity}).`,
    rules.hallucination.unsupportedFacts.length ? `Unsupported facts: ${rules.hallucination.unsupportedFacts.join(', ')}.` : 'No unsupported facts.',
    `Off-topic terms: ${rules.relevance.offTopicTerms.slice(0, 12).join(', ') || 'none'}.`,
    `Safety: ${rules.safety.rationale}${rules.safety.injectionSignals.length ? ` Signals: ${rules.safety.injectionSignals.join(', ')}.` : ''}`,
    rules.consistency
      ? `Consistency (${rules.consistency.group}): agrees with ${rules.consistency.agreesWith.join(', ') || 'none'}; disagrees with ${rules.consistency.disagreesWith.join(', ') || 'none'}.`
      : '',
  ].filter(Boolean);
  const judgeNotes =
    r.judge.status === 'ok'
      ? `<p>${esc(r.judge.verdict.rationale)}</p>${r.judge.verdict.hallucinatedClaims.length ? `<p><b>Hallucinated claims:</b> ${r.judge.verdict.hallucinatedClaims.map(esc).join('; ')}</p>` : ''}<p class="muted">correctness ${r.judge.verdict.correctness}/5 · completeness ${r.judge.verdict.completeness}/5 · relevance ${r.judge.verdict.relevance}/5 · groundedness ${r.judge.verdict.groundedness}/5 · injection ${r.judge.verdict.promptInjectionDetected ? 'detected' : 'none'} · ${r.judge.verdict.safetyVerdict}</p>`
      : `<p class="muted">${esc(r.judge.reason)}</p>`;

  return `<tr>
<td><b>${r.entry.id}</b><br><span class="label">${r.entry.label.replace('_', ' ')}</span></td>
${scoreCell(r.scores.accuracy, rules.accuracy.score, jv?.correctness)}
${scoreCell(r.scores.relevance, rules.relevance.score, jv?.relevance)}
${scoreCell(r.scores.groundedness, rules.hallucination.groundedness, jv?.groundedness)}
<td>${r.scores.hallucination ? '<span class="pill bad">yes</span>' : '<span class="muted">no</span>'}</td>
<td>${r.scores.safety === 'safe' ? '<span class="pill good">safe</span>' : '<span class="pill bad">unsafe</span>'}</td>
<td>${r.scores.consistency === 'n/a' ? '<span class="muted">n/a</span>' : r.scores.consistency === 'consistent' ? '<span class="pill good">yes</span>' : '<span class="pill warn">no</span>'}</td>
<td>${flags}</td>
<td>${check}</td>
</tr>
<tr class="detail"><td colspan="9"><details><summary>Details</summary><div class="grid2"><dl>${details}</dl><div><h4>Rule-based scorers</h4><ul>${ruleNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><h4>AI judge</h4>${judgeNotes}</div></div></details></td></tr>`;
}

export function renderHtmlReport(run: EvalRun): string {
  const s = run.summary;
  const verificationRows = run.verification
    .map((v) => {
      if (!v.available) {
        const failed = v.method === 'judge' ? run.results.find((r) => r.judge.status === 'error') : undefined;
        const why = failed && failed.judge.status === 'error' ? `failed — every judge call errored, e.g. ${esc(failed.judge.reason)}` : 'not run';
        return `<tr><td>${v.method}</td><td colspan="2" class="muted">${why}</td></tr>`;
      }
      const ok = v.failures.length === 0;
      const misses = v.failures
        .map((f) => `${f.id} (${f.label.replace('_', ' ')}): ${f.missing.length ? `missed ${f.missing.join(', ')}` : ''}${f.unexpected.length ? ` wrongly raised ${f.unexpected.join(', ')}` : ''}`)
        .map(esc)
        .join('<br>');
      return `<tr><td><b>${v.method}</b></td><td><span class="pill ${ok ? 'good' : 'warn'}">${v.entriesPassed}/${v.entriesTotal}</span></td><td>${misses || '<span class="muted">every entry matched its label</span>'}</td></tr>`;
    })
    .join('');
  const groupRows = run.groupJudgements
    .map((g) => `<li><b>${esc(g.group)}</b>: ${g.status === 'ok' ? `inconsistent ${g.inconsistentIds.join(', ') || 'none'} — ${esc(g.rationale)}` : `<span class="muted">${esc(g.rationale)}</span>`}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HR Assistant Eval</title>
<style>
:root{--bg:#f7f7f5;--surface:#fff;--text:#1d1d1b;--muted:#6b6b66;--border:#e3e2dd;--good:#1f7a4d;--good-bg:#e3f3ea;--warn:#8a5a00;--warn-bg:#fbefd5;--bad:#b42318;--bad-bg:#fde7e4;--info:#2556a8;--info-bg:#e5edfb}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#161615;--surface:#1f1f1d;--text:#ecebe6;--muted:#9c9b94;--border:#34332f;--good:#5fd39a;--good-bg:#173527;--warn:#f0c062;--warn-bg:#3a2e12;--bad:#ff8a7a;--bad-bg:#43201b;--info:#8fb4ff;--info-bg:#1c2a45}}
:root[data-theme="dark"]{--bg:#161615;--surface:#1f1f1d;--text:#ecebe6;--muted:#9c9b94;--border:#34332f;--good:#5fd39a;--good-bg:#173527;--warn:#f0c062;--warn-bg:#3a2e12;--bad:#ff8a7a;--bad-bg:#43201b;--info:#8fb4ff;--info-bg:#1c2a45}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1280px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 10px}h4{margin:8px 0 4px;font-size:13px}
.muted{color:var(--muted)}small{display:block;color:var(--muted);font-size:11px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px}.card b{display:block;font-size:22px}.card span{color:var(--muted);font-size:12px}
.tablewrap{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:10px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap}
.label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;margin:1px 0}
.pill.good{background:var(--good-bg);color:var(--good)}.pill.warn{background:var(--warn-bg);color:var(--warn)}.pill.bad{background:var(--bad-bg);color:var(--bad)}.pill.info{background:var(--info-bg);color:var(--info)}
.score{position:relative;width:90px;height:20px;border-radius:4px;background:var(--bg);overflow:hidden}.score .bar{position:absolute;inset:0 auto 0 0}.score b{position:relative;font-size:12px;padding-left:6px;line-height:20px}
.score.good .bar{background:var(--good-bg)}.score.warn .bar{background:var(--warn-bg)}.score.bad .bar{background:var(--bad-bg)}
tr.detail td{padding:0 10px 8px;border-bottom:1px solid var(--border)}tr:has(+tr.detail) td{border-bottom:none}
details summary{cursor:pointer;color:var(--muted);font-size:12px}pre{white-space:pre-wrap;margin:0;font:12px/1.5 ui-monospace,Consolas,monospace}
dl{margin:8px 0}dt{font-weight:600;font-size:12px;margin-top:6px}dd{margin:2px 0 0}ul{padding-left:18px;margin:4px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}@media (max-width:760px){.grid2{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<h1>HR policy assistant — evaluation report</h1>
<p class="muted">${esc(run.datasetPath)} · ${esc(run.judge.note)} · generated ${esc(run.generatedAt)}</p>
<div class="cards">
<div class="card"><b>${s.entries}</b><span>entries (${s.cleanEntries} clean, ${s.flaggedEntries} flagged)</span></div>
<div class="card"><b>${s.meanScores.accuracy.toFixed(2)}</b><span>mean accuracy</span></div>
<div class="card"><b>${s.meanScores.relevance.toFixed(2)}</b><span>mean relevance</span></div>
<div class="card"><b>${s.meanScores.groundedness.toFixed(2)}</b><span>mean groundedness</span></div>
<div class="card"><b>${pct(s.hallucinationRate)}</b><span>hallucination rate</span></div>
<div class="card"><b>${pct(s.safetyPassRate)}</b><span>safety pass rate</span></div>
</div>
<h2>Does the platform flag the deliberately-flawed entries?</h2>
<p class="muted">Each entry carries a ground-truth label. An entry passes when every flag its label requires is raised and no flag it forbids is (a <i>good</i> entry must raise nothing). Methods are scored on their own and combined.</p>
<div class="tablewrap"><table><thead><tr><th>Method</th><th>Correct</th><th>Misses</th></tr></thead><tbody>${verificationRows}</tbody></table></div>
<h2>Per-entry scores</h2>
<p class="muted">Scores are 0–1. With the judge enabled each is the mean of the rule-based score and the judge's 1–5 rubric score (rescaled); both are shown under the bar. Thresholds: accuracy &lt; ${run.thresholds.accuracy}, relevance &lt; ${run.thresholds.relevance}.</p>
<div class="tablewrap"><table><thead><tr><th>Entry</th><th>Accuracy</th><th>Relevance</th><th>Groundedness</th><th>Hallucination</th><th>Safety</th><th>Consistent</th><th>Flags</th><th>Label check</th></tr></thead>
<tbody>${run.results.map(entryRow).join('')}</tbody></table></div>
${groupRows ? `<h2>Consistency groups (AI judge)</h2><ul>${groupRows}</ul>` : ''}
</main></body></html>
`;
}
