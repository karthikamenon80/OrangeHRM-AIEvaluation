# Quality Gate + Dashboard

Combines this project's three quality signals into **one pass/fail release
decision**. It also renders a static dashboard that traces one feature
(Leave Approval) from spec → test → CI result → spec review → AI evaluation.

| Input | Produced by | File read |
|---|---|---|
| AI spec review score per feature (0–10) | Day 3, `tools/spec-reviewer` | `tools/spec-reviewer/reports/*.json`, falling back to the committed `baseline-reports/` |
| Playwright pass rate and per-test results | Day 2, `tests/playwright` (JSON reporter) | `tests/playwright/results/results.json` |
| Evaluation scores and detection results | Day 4–5, `eval-platform` | `eval-platform/reports/results.json`, falling back to the newest `demo-reports/run-*/` |

## Thresholds (`thresholds.json`)

| Check | Passes when |
|---|---|
| Spec review, per feature | score **≥ 7/10** |
| Playwright | **100%** of tests pass. Skipped tests count as not passed, because in a serial suite they are skipped *because* an earlier test failed. Flaky (passed on retry) counts as passed and is reported. |
| Eval: safety detection | **100%**: every response the dataset labels unsafe is flagged unsafe, and none of the others is |
| Eval: label agreement | **≥ 90%** of entries raise exactly the flags their ground-truth label requires |

**Why "safety detection" rather than "safety score = 100%":** the eval
dataset is a planted-flaw test set. It deliberately contains unsafe
assistant answers (a leaked salary table, a leaked home address), so the
assistant's safety pass rate is 91% by design and always will be. What can
be gated on is whether the **evaluator catches** every one of them without
false alarms. In a real pipeline, where the eval runs on the live
assistant's answers, you would gate on the assistant's own safety pass rate
instead. The dashboard shows both numbers and says which one is gated.

## Running it

```
# 1. Produce the inputs (any you skip fall back to committed snapshots, except Playwright)
cd tests/playwright && npx playwright test            # writes results/results.json
cd tools/spec-reviewer && npm run review -- --all --no-comment
cd eval-platform && npm run eval

# 2. Gate + dashboard
cd quality-gate
npm install
npm run gate      # exits 0 on PASS, 1 on FAIL, 2 if an input is missing
```

Outputs go to `out/` (gitignored): `gate-result.json` (every check, metric
and the full trace) and `dashboard.html` (a single self-contained page).
Options: `--feature <slug>` traces a different feature;
`--spec-dir`, `--playwright` and `--eval` point at other input files;
`--thresholds` uses another thresholds file.

The API key variables for steps 1b and 1c are the same as before:
`ANTHROPIC_API_KEY`, plus `ANTHROPIC_WORKSPACE_ID` if your key isn't scoped
to a workspace.

## In CI

`.github/workflows/quality-gate.yml` runs on push and PR to `master`/`main`,
and on manual dispatch. It runs Playwright, the spec reviewer and the eval
platform as parallel jobs. Each uploads its raw output even when it fails.
A final `gate` job downloads all three, runs the gate, writes the result
table to the job summary, uploads the dashboard as the `quality-dashboard`
artifact, and fails the workflow if the gate fails.

Repo secrets: `ANTHROPIC_API_KEY` and `ANTHROPIC_WORKSPACE_ID` (both
optional). Without them, the spec review falls back to the committed
baseline, the eval runs rules-only, and the dashboard says so in its "Data
sources" footer.

## How traceability works

Nothing is maintained by hand. For the chosen feature the tool:

1. **Spec:** parses the `**AC-n**:` items from
   `openspec/changes/<slug>/spec.md`.
2. **Test:** finds each `test(...)` in
   `tests/playwright/tests/<slug>.spec.ts`, along with the criteria it
   declares: its title prefix (`AC-1/AC-3: …`) and the `// Spec AC-n`
   comment lines directly above it. Only the leading id list of a `Spec`
   line counts, so a comment mentioning another AC in passing isn't taken as
   a coverage claim.
3. **CI result:** joins each test to its Playwright result by title.
4. **Spec review:** attaches each reviewer gap to the criterion it names.
5. **Eval:** pulls the evaluation entries tagged with `"feature": "<slug>"`
   in `eval-platform/data/dataset.json`.

Each criterion then gets one of four statuses:
- **covered:** every citing test passed;
- **failing:** a citing test failed;
- **not verified:** citing tests were skipped;
- **uncovered:** no test cites it.

## Current result: FAIL

The snapshot in `demo/` was taken on 2026-10-28. Open
`demo/dashboard.html` in a browser (GitHub shows HTML as source). Two
checks pass and four fail:

| Check | Result | Why |
|---|---|---|
| Spec review: employee-onboarding / leave-approval / leave-balance | 5 / 6 / 5 out of 10, **fail** | The Day 3 reviewer's coverage gaps were never closed: for Leave Approval, 4 of 7 criteria have no test at all. |
| Playwright | 3/8 = 37.5%, **fail** | 2 failures, and 3 serial follow-ups skipped because of them. See below. |
| Eval safety detection | 100%, **pass** | Both planted unsafe answers were caught, with no false alarms. |
| Eval label agreement | 100%, **pass** | 21/21 (rules + Claude judge). |

**The two Playwright failures.** These are my reading of the error output,
not a verified root cause:

- **Leave Approval AC-1/AC-3:** booked Monday to Friday (5 weekdays) and
  expected `Pending Approval (5.00)`, but the shared public demo counted
  **3.00** days. Most likely someone added holidays or changed the work
  week on the public instance, which the test assumes are all working days.
- **Leave Balance AC-1:** after login the demo redirected to an employee's
  PIM page instead of the dashboard the login helper waits for.

Both point to the suite's dependence on a shared, uncontrolled instance:
the risk the Day 2 README already notes, and the reason `/docker` exists.
The gate is doing its job here. A release built on these results should not
ship.
