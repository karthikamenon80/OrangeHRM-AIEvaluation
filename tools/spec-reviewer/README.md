# AI Spec Reviewer

Compares each `openspec/changes/<slug>/spec.md` against its corresponding
`tests/playwright/tests/<slug>.spec.ts` using the Claude API, and flags:

- **Missing acceptance criteria** — an AC in the spec with no test citing it.
- **Missing edge cases** — an Edge Cases bullet with no test scenario for it
  (edge cases the spec itself already discloses as "not exercised" are
  reported at low severity, not treated as an equal-weight miss).
- **Contradictions** — a test assertion that doesn't match the spec's
  "Observed behavior" section (the closest thing this project has to ground
  truth, since OrangeHRM itself is a black box under test, not something we
  wrote).
- **Weak assertions** — a test that cites an AC but doesn't actually verify
  the thing that AC claims.

Output is a score (0-10) plus a structured list of gaps, both printed to the
console and written to `reports/<slug>.{json,md}` and `reports/combined.md`.

## Running it

```
cd tools/spec-reviewer
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run review -- --all
```

Flags:
- `--slug <name>` — review one feature (repeatable). Defaults to
  auto-detecting from `git diff` against the PR base branch, or against the
  previous commit outside of a PR.
- `--all` — review every feature under `openspec/changes/`.
- `--no-comment` — skip posting/updating the PR comment (used for local runs
  and for the demo below); the console/file output is unaffected either way.
- `--out <dir>` — where to write report files (default: `./reports`).

`CLAUDE_MODEL` overrides the model (default `claude-sonnet-5`).

## How it's wired into CI

`.github/workflows/spec-review.yml` runs automatically on push/merge to
`master` when `openspec/changes/**` or `tests/playwright/**` changed, and by
hand on any branch (**Actions → AI Spec Reviewer → Run workflow**). Feature
branches and PRs don't trigger it. On a manual run, tick **Review all
features** to pass `--all`. Otherwise,
it runs with no `--slug`/`--all` flag and the script auto-detects which
features the latest commit changed from `git diff`, reviewing all of them if
none changed. The combined review is uploaded as the `spec-review-reports`
artifact. The PR-comment code (`githubComment.ts`) only posts when the run
was triggered by a pull request, so these runs don't comment.

## Committed reports

- `baseline-reports/`: the first review of the full suite (scores 5, 6
  and 5 out of 10). The quality gate also uses these as its fallback when
  no API key is available.
- `latest-reports/`: the review from the `master` CI run on 2026-10-28,
  after the missing tests were written (9/10 for every feature, no
  high-severity gaps).
- `gap-demo-reports/`: the planted-gap demo described below.

## Demo: proving it catches a real gap

See `DEMO.md` in this folder for a before/after run where the AC-8 edge-case
check was deliberately removed from `leave-balance-validation.spec.ts`, the
reviewer flagged it, and the test was restored.
