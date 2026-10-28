import type { GateCheck, GateMetrics, Thresholds } from './gate.js';
import type { SourceInfo, TestResult } from './sources.js';
import type { FeatureTrace, TracedCriterion } from './traceability.js';

export interface DashboardInput {
  generatedAt: string;
  passed: boolean;
  checks: GateCheck[];
  metrics: GateMetrics;
  thresholds: Thresholds;
  tests: TestResult[];
  trace: FeatureTrace;
  sources: { specReview: SourceInfo; playwright: SourceInfo; evaluation: SourceInfo };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const day = (iso: string) => iso.slice(0, 16).replace('T', ' ') + ' UTC';

// Status always ships as icon + label, never colour alone.
type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';
const ICON: Record<Tone, string> = { good: '✓', warning: '!', serious: '!', critical: '✕', neutral: '–' };
const chip = (tone: Tone, label: string) => `<span class="chip ${tone}"><span aria-hidden="true">${ICON[tone]}</span> ${esc(label)}</span>`;

const testTone: Record<string, Tone> = { passed: 'good', flaky: 'warning', skipped: 'neutral', failed: 'critical', 'not run': 'neutral' };
const severityTone: Record<string, Tone> = { high: 'critical', medium: 'serious', low: 'warning' };
const criterionTone: Record<TracedCriterion['status'], Tone> = { covered: 'good', failing: 'critical', unverified: 'warning', uncovered: 'serious' };

/** Horizontal bar on a fixed scale, with an optional threshold tick. Value is labelled directly. */
function hbar(label: string, value: number, max: number, display: string, tip: string, threshold?: number): string {
  const w = Math.max(0, Math.min(1, value / max)) * 100;
  const tick = threshold === undefined ? '' : `<span class="tick" style="left:${(threshold / max) * 100}%" aria-hidden="true"></span>`;
  return `<div class="hbar" tabindex="0" data-tip="${esc(tip)}">
<span class="hbar-label">${esc(label)}</span>
<span class="hbar-track"><span class="hbar-fill" style="width:${w}%"></span>${tick}</span>
<span class="hbar-value">${esc(display)}</span></div>`;
}

function statTile(value: string, label: string, sub: string, tone?: Tone): string {
  return `<div class="tile"><span class="tile-label">${esc(label)}</span><b class="tile-value">${esc(value)}</b><span class="tile-sub">${tone ? chip(tone, sub) : esc(sub)}</span></div>`;
}

function sourceLine(name: string, s: SourceInfo): string {
  return `<li><b>${esc(name)}</b>: <code>${esc(s.path)}</code>, ${esc(day(s.asOf))}${s.snapshot ? ' <span class="muted">(committed snapshot, not a fresh run)</span>' : ''}</li>`;
}

function traceSection(t: FeatureTrace, tests: TestResult[]): string {
  const covered = t.criteria.filter((c) => c.status === 'covered').length;
  const tracedTests = [...new Map(t.criteria.flatMap((c) => c.tests).map((x) => [x.title, x])).values()];
  const testsPassing = tracedTests.filter((x) => x.status === 'passed' || x.status === 'flaky').length;
  const evalPassed = t.evalEntries.filter((e) => e.verification?.passed).length;
  const fileTests = tests.filter((x) => x.file.endsWith(`${t.slug}.spec.ts`));

  const stage = (n: string, title: string, value: string, sub: string, tone: Tone) =>
    `<div class="stage"><span class="stage-n">${n}</span><span class="stage-title">${esc(title)}</span><b>${esc(value)}</b>${chip(tone, sub)}</div>`;

  const rows = t.criteria
    .map((c) => {
      const testsCell = c.tests.length
        ? c.tests.map((x) => `<div class="trace-test">${chip(testTone[x.status], x.status)} <span>${esc(x.title)}</span>${x.error ? `<small class="err">${esc(x.error)}</small>` : ''}</div>`).join('')
        : '<span class="muted">No test cites this criterion</span>';
      const gapsCell = c.reviewGaps.length
        ? c.reviewGaps.map((g) => `<div class="gap">${chip(severityTone[g.severity], g.severity)} <span>${esc(g.description)}</span></div>`).join('')
        : '<span class="muted">none</span>';
      return `<tr><td><b>${c.id}</b><br>${chip(criterionTone[c.status], c.status === 'unverified' ? 'not verified' : c.status)}</td><td class="ac-text">${esc(c.text)}</td><td>${testsCell}</td><td>${gapsCell}</td></tr>`;
    })
    .join('');

  const evalRows = t.evalEntries
    .map(
      (e) => `<tr><td><b>${esc(e.entry.id)}</b><br><span class="muted">${esc(e.entry.label.replace(/_/g, ' '))}</span></td>
<td>${esc(e.entry.prompt)}</td><td class="resp">${esc(e.entry.response)}</td>
<td>${e.flags.length ? e.flags.map((f) => `<code>${esc(f)}</code>`).join(' ') : '<span class="muted">none</span>'}</td>
<td class="num">${e.scores.accuracy.toFixed(2)}</td><td class="num">${e.scores.groundedness.toFixed(2)}</td>
<td>${e.verification ? chip(e.verification.passed ? 'good' : 'critical', e.verification.passed ? 'caught as labelled' : 'missed') : '–'}</td></tr>`
    )
    .join('');

  return `<section id="trace">
<h2>Traceability: ${esc(t.title)}</h2>
<p class="muted">One feature followed through every stage. Spec criteria are parsed from <code>${esc(t.specPath)}</code>; each test declares the criteria it covers (title prefix and <code>// Spec AC-n</code> comments in <code>${esc(t.testPath)}</code>); results come from the Playwright run; gaps come from the AI spec reviewer; eval entries are the HR assistant answers about this feature.</p>
<div class="pipeline">
${stage('1', 'Spec', `${t.criteria.length} criteria`, `${covered} covered by a passing test`, covered === t.criteria.length ? 'good' : 'serious')}
<span class="arrow" aria-hidden="true">→</span>
${stage('2', 'Tests', `${fileTests.length} tests`, `cite ${new Set(t.criteria.filter((c) => c.tests.length).map((c) => c.id)).size}/${t.criteria.length} criteria`, t.criteria.every((c) => c.tests.length) ? 'good' : 'serious')}
<span class="arrow" aria-hidden="true">→</span>
${stage('3', 'CI result', `${testsPassing}/${tracedTests.length} passing`, testsPassing === tracedTests.length ? 'green' : 'failures', testsPassing === tracedTests.length ? 'good' : 'critical')}
<span class="arrow" aria-hidden="true">→</span>
${stage('4', 'Spec review', t.review ? `${t.review.score}/10` : 'n/a', `${t.criteria.reduce((n, c) => n + c.reviewGaps.length, 0) + t.otherGaps.length} gaps`, t.review && t.review.score >= 7 ? 'good' : 'serious')}
<span class="arrow" aria-hidden="true">→</span>
${stage('5', 'Eval', `${t.evalEntries.length} answers`, `${evalPassed}/${t.evalEntries.length} flagged correctly`, evalPassed === t.evalEntries.length ? 'good' : 'critical')}
</div>
<h3>Acceptance criteria → tests → CI → review</h3>
<div class="tablewrap"><table><thead><tr><th>Criterion</th><th>What it requires</th><th>Tests citing it, with CI result</th><th>Spec reviewer gaps</th></tr></thead><tbody>${rows}</tbody></table></div>
${t.otherGaps.length ? `<details><summary>${t.otherGaps.length} further review gaps not tied to one criterion (edge cases)</summary><ul class="plain">${t.otherGaps.map((g) => `<li>${chip(severityTone[g.severity], g.severity)} <b>${esc(g.reference)}</b>: ${esc(g.description)}</li>`).join('')}</ul></details>` : ''}
<h3>Evaluation: the HR assistant's answers about this feature</h3>
<div class="tablewrap"><table><thead><tr><th>Entry</th><th>Question</th><th>Assistant answer</th><th>Flags raised</th><th>Accuracy</th><th>Grounded</th><th>Label check</th></tr></thead><tbody>${evalRows || '<tr><td colspan="7" class="muted">No eval entries are tagged with this feature.</td></tr>'}</tbody></table></div>
</section>`;
}

export function renderDashboard(d: DashboardInput): string {
  const { metrics: m, thresholds: th } = d;
  const failing = d.checks.filter((c) => !c.passed);
  const minSpec = Math.min(...m.specScores.map((s) => s.score));

  const checkRows = d.checks
    .map((c) => `<tr><td>${esc(c.area)}</td><td>${esc(c.name)}</td><td class="num">${esc(c.actual)}</td><td class="num">${esc(c.threshold)}</td><td>${chip(c.passed ? 'good' : 'critical', c.passed ? 'pass' : 'fail')}</td><td>${esc(c.detail)}</td></tr>`)
    .join('');

  const specBars = m.specScores
    .map((s) => hbar(s.slug, s.score, 10, `${s.score}/10`, `${s.slug}: ${s.score}/10 · ${s.gaps} gaps (${s.highGaps} high) · gate needs ≥ ${th.specReview.minScorePerFeature}`, th.specReview.minScorePerFeature))
    .join('');

  const ev = m.evaluation;
  const evalBars = [
    ['Accuracy', ev.meanAccuracy, 'Mean similarity to the reference answer (rules + judge)'],
    ['Relevance', ev.meanRelevance, 'Mean on-topic score'],
    ['Groundedness', ev.meanGroundedness, 'Mean share of policy details supported by the handbook'],
  ]
    .map(([label, v, tip]) => hbar(label as string, v as number, 1, (v as number).toFixed(2), `${tip}: ${(v as number).toFixed(2)} across ${ev.entries} answers`))
    .join('');

  const byFeature = new Map<string, TestResult[]>();
  for (const t of d.tests) byFeature.set(t.file, [...(byFeature.get(t.file) ?? []), t]);
  const testRows = [...byFeature.entries()]
    .map(([file, ts]) =>
      ts.map((t, i) => `<tr>${i === 0 ? `<td rowspan="${ts.length}"><code>${esc(file.replace(/\.spec\.ts$/, ''))}</code></td>` : ''}<td>${esc(t.title)}${t.error ? `<small class="err">${esc(t.error)}</small>` : ''}</td><td>${chip(testTone[t.status], t.status)}</td><td class="num">${(t.durationMs / 1000).toFixed(1)} s</td></tr>`).join('')
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quality Gate Dashboard</title>
<style>
:root{--bg:#f4f4f2;--surface:#fcfcfb;--text:#0b0b0b;--text-2:#52514e;--muted:#6f6e69;--border:#e2e1dc;--track:#dbe8f8;--series:#2a78d6;--good:#0ca30c;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;--good-ink:#006300;--critical-ink:#a32020;--serious-ink:#9a4a20;--warning-ink:#7a5200;--tick:#0b0b0b}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121211;--surface:#1a1a19;--text:#f0efec;--text-2:#c3c2b7;--muted:#9c9b94;--border:#34332f;--track:#1f3550;--series:#3987e5;--good-ink:#5fd35f;--critical-ink:#ff8a80;--serious-ink:#f3a07c;--warning-ink:#fcc94d;--tick:#f0efec}}
:root[data-theme="dark"]{--bg:#121211;--surface:#1a1a19;--text:#f0efec;--text-2:#c3c2b7;--muted:#9c9b94;--border:#34332f;--track:#1f3550;--series:#3987e5;--good-ink:#5fd35f;--critical-ink:#ff8a80;--serious-ink:#f3a07c;--warning-ink:#fcc94d;--tick:#f0efec}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1240px;margin:0 auto;padding:24px 16px 56px}h1{font-size:20px;margin:0}h2{font-size:17px;margin:40px 0 6px}h3{font-size:14px;margin:22px 0 8px;color:var(--text-2)}
.muted{color:var(--muted)}code{font:12px ui-monospace,Consolas,monospace}small{display:block;font-size:11px}.err{color:var(--critical-ink)}
.hero{display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 22px;margin-top:14px}
.verdict{display:flex;align-items:center;gap:14px}.verdict-icon{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-size:28px;font-weight:700;color:#fff}
.verdict.pass .verdict-icon{background:var(--good)}.verdict.fail .verdict-icon{background:var(--critical)}
.verdict b{font-size:48px;line-height:1;letter-spacing:-.01em}.verdict.pass b{color:var(--good-ink)}.verdict.fail b{color:var(--critical-ink)}
.hero ul{margin:0;padding-left:18px;max-width:640px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:12px}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.tile-label{font-size:12px;color:var(--text-2)}.tile-value{font-size:28px;line-height:1.2}.tile-sub{font-size:12px;color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;border:1px solid currentColor}
.chip.good{color:var(--good-ink)}.chip.critical{color:var(--critical-ink)}.chip.serious{color:var(--serious-ink)}.chip.warning{color:var(--warning-ink)}.chip.neutral{color:var(--muted)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:820px){.grid2{grid-template-columns:1fr}}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.panel h3{margin-top:0}
.hbar{display:grid;grid-template-columns:minmax(110px,190px) 1fr 52px;align-items:center;gap:10px;padding:6px 0;outline:none}
.hbar:focus-visible{box-shadow:0 0 0 2px var(--series);border-radius:4px}
.hbar-label{font-size:13px;overflow-wrap:anywhere}.hbar-value{font-size:13px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.hbar-track{position:relative;height:14px;background:var(--track);border-radius:0 4px 4px 0}
.hbar-fill{position:absolute;inset:0 auto 0 0;background:var(--series);border-radius:0 4px 4px 0}
.tick{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--tick)}
.legend{font-size:12px;color:var(--muted);margin-top:6px}.legend i{display:inline-block;width:2px;height:12px;background:var(--tick);vertical-align:middle;margin:0 4px}
.tablewrap{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:10px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
th{font-size:12px;color:var(--text-2);font-weight:600;white-space:nowrap}tbody tr:last-child td{border-bottom:none}td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ac-text{min-width:240px;max-width:360px;color:var(--text-2)}.resp{max-width:280px;color:var(--text-2)}
.trace-test,.gap{display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;margin:2px 0}.gap span:last-child{flex:1 1 220px;font-size:12px;color:var(--text-2)}
.pipeline{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin:12px 0}
.stage{flex:1 1 150px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
.stage-n{font-size:11px;color:var(--muted)}.stage-title{font-size:12px;color:var(--text-2)}.stage b{font-size:18px}
.arrow{align-self:center;color:var(--muted);font-size:18px}@media (max-width:820px){.arrow{display:none}}
details{margin-top:8px}summary{cursor:pointer;color:var(--text-2);font-size:13px}ul.plain{list-style:none;padding:0}ul.plain li{margin:6px 0;font-size:13px}
#tip{position:fixed;pointer-events:none;background:var(--text);color:var(--bg);font-size:12px;padding:6px 8px;border-radius:6px;max-width:280px;opacity:0;transition:opacity .1s;z-index:10}
footer{margin-top:40px;font-size:12px;color:var(--muted)}footer ul{padding-left:18px}
</style>
</head>
<body><main>
<h1>Release quality gate</h1>
<p class="muted">Spec review (Day 3) + Playwright (Day 2) + AI evaluation (Day 4–5) in one decision. Generated ${esc(day(d.generatedAt))}.</p>

<div class="hero">
<div class="verdict ${d.passed ? 'pass' : 'fail'}" role="status"><span class="verdict-icon" aria-hidden="true">${d.passed ? '✓' : '✕'}</span><div><b>${d.passed ? 'PASS' : 'FAIL'}</b><div class="muted">${d.checks.length - failing.length} of ${d.checks.length} checks passed</div></div></div>
${failing.length ? `<div><b>Blocking:</b><ul>${failing.map((c) => `<li>${esc(c.name)}: ${esc(c.actual)} (needs ${esc(c.threshold)})</li>`).join('')}</ul></div>` : '<div>All gate checks passed.</div>'}
</div>

<div class="tiles">
${statTile(pct(m.playwright.passRate), 'Playwright pass rate', `${m.playwright.passed}/${m.playwright.total} tests`, m.playwright.passRate >= th.playwright.minPassRate ? 'good' : 'critical')}
${statTile(`${minSpec}/10`, 'Lowest spec review score', `gate needs ≥ ${th.specReview.minScorePerFeature}`, minSpec >= th.specReview.minScorePerFeature ? 'good' : 'critical')}
${statTile(pct(ev.safetyDetection), 'Eval safety detection', 'unsafe answers caught, no false alarms', ev.safetyDetection >= th.evaluation.minSafetyDetection ? 'good' : 'critical')}
${statTile(pct(ev.labelAgreement), 'Eval flags match labels', `${ev.entries} labelled answers`, ev.labelAgreement >= th.evaluation.minLabelAgreement ? 'good' : 'critical')}
</div>

<h2>Gate checks</h2>
<div class="tablewrap"><table><thead><tr><th>Area</th><th>Check</th><th>Actual</th><th>Threshold</th><th>Result</th><th>Detail</th></tr></thead><tbody>${checkRows}</tbody></table></div>

<div class="grid2" style="margin-top:16px">
<div class="panel"><h3>Spec review score per feature (0–10)</h3>${specBars}<div class="legend"><i></i>gate threshold (${th.specReview.minScorePerFeature})</div></div>
<div class="panel"><h3>Evaluation scores per dimension (0–1, higher is better)</h3>${evalBars}
<div class="tiles" style="margin-top:10px">
${statTile(pct(ev.hallucinationRate), 'Hallucination rate', 'answers flagged for invented policy')}
${statTile(pct(ev.safetyPassRate), 'Safety pass rate', 'answers judged safe')}
</div>
<p class="legend">The dataset deliberately contains flawed answers, so these describe the simulated assistant, not the evaluator. The gate checks the evaluator's detection: every planted unsafe answer must be caught.</p></div>
</div>

<h2>Playwright results</h2>
<div class="tablewrap"><table><thead><tr><th>Feature</th><th>Test</th><th>Result</th><th>Duration</th></tr></thead><tbody>${testRows}</tbody></table></div>

${traceSection(d.trace, d.tests)}

<footer><b>Data sources</b><ul>
${sourceLine('Spec review', d.sources.specReview)}
${sourceLine('Playwright', d.sources.playwright)}
${sourceLine('Evaluation', d.sources.evaluation)}
</ul>Thresholds: <code>quality-gate/thresholds.json</code>.</footer>
</main>
<div id="tip" role="tooltip"></div>
<script>
(function(){var tip=document.getElementById('tip');
function show(el,x,y){tip.textContent=el.getAttribute('data-tip');tip.style.opacity=1;var r=tip.getBoundingClientRect();tip.style.left=Math.min(x+12,innerWidth-r.width-8)+'px';tip.style.top=Math.max(8,y-r.height-10)+'px'}
function hide(){tip.style.opacity=0}
document.querySelectorAll('[data-tip]').forEach(function(el){
el.addEventListener('mousemove',function(e){show(el,e.clientX,e.clientY)});el.addEventListener('mouseleave',hide);
el.addEventListener('focus',function(){var r=el.getBoundingClientRect();show(el,r.left+r.width/2,r.top)});el.addEventListener('blur',hide)})})();
</script>
</body></html>
`;
}
