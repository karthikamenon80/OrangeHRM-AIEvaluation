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

`.github/workflows/spec-review.yml` runs this on every push/PR that touches
`openspec/changes/**` or `tests/playwright/**`, with no `--slug`/`--all` flag
— it lets the script auto-detect which features changed from `git diff`, and
posts (or updates, on repeat pushes to the same PR) one PR comment with the
combined review.

## Demo: proving it catches a real gap

See `DEMO.md` in this folder for a before/after run where the AC-8 edge-case
check was deliberately removed from `leave-balance-validation.spec.ts`, the
reviewer flagged it, and the test was restored.
