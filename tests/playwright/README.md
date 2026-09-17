# OrangeHRM Playwright Suite

A minimal Page Object Model suite covering only the screens needed for the
three Day 1 specs in `openspec/changes/`:

| Page Object              | Screen                                  | Used by spec(s)                                    |
|---------------------------|------------------------------------------|-----------------------------------------------------|
| `LoginPage`               | Login / Logout                          | all                                                  |
| `AddEmployeePage`         | PIM → Add Employee                      | `employee-onboarding`                                |
| `LeaveEntitlementPage`    | Leave → Entitlements → Add Entitlement  | `leave-balance-validation`, setup for `leave-approval-workflow` |
| `ApplyLeavePage`          | Leave → Apply Leave                     | `leave-balance-validation`, `leave-approval-workflow` |
| `LeaveListPage`           | Leave → Leave List (approver view)      | `leave-approval-workflow`                            |
| `MyLeavePage`             | Leave → My Leave (employee view)        | `leave-approval-workflow`                            |

## Traceability

Every test file opens with a comment pointing at the spec.md it was derived
from, and every `test(...)` is preceded by a comment naming the specific
acceptance criterion (or criteria) it covers, e.g. `// Spec AC-6: ...`. Where
one test covers more than one AC, that's because the spec itself documents
those criteria as one observed, inseparable round trip (see the comment for
why in each case).

## Why the suite targets the public demo

Docker isn't set up in this environment yet, so `BASE_URL` defaults to
OrangeHRM's official public demo — the same instance the Day 1 specs were
written against. Point `BASE_URL` at a local docker-compose instance (see
`/docker`) once available; no test code needs to change.

Because the target is a shared, publicly-writable instance whose data does
not reliably persist between sessions, every test that needs an
employee/login creates its own uniquely-named fixture via the real UI rather
than depending on hardcoded or previously-created data. Tests run
`workers: 1` / serially for the same reason — see comments in
`playwright.config.ts` and each spec file's `describe.serial` block.

## Running locally

```
cd tests/playwright
npm install
npx playwright install chromium
npm test
```

Override the target and admin credentials via environment variables:

```
BASE_URL=http://localhost:8080 OHRM_ADMIN_USERNAME=Admin OHRM_ADMIN_PASSWORD=admin123 npm test
```

View the HTML report after a run:

```
npm run report
```
