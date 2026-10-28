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
| `MyLeavePage`             | Leave → My Leave (employee view)        | `leave-approval-workflow`, `leave-balance-validation` |
| `DashboardPage`           | Dashboard → My Actions widget           | `leave-approval-workflow`                            |
| `PersonalDetailsPage`     | PIM → Employee → Personal Details       | `employee-onboarding`                                |

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

## Reliability fixes (Day 6)

The first combined quality-gate run failed two tests. Neither was a product
bug or random flakiness; each had a specific, reproducible cause:

- **Public holidays in the booked week.** Leave tests book "the Monday at
  least a week from today" and expect Mon–Fri to cost 5.00 days. The demo
  has recurring holidays (e.g. 11 and 12 November), so in some weeks of the
  year it cost 3.00. `utils/leaveCalendar.ts` now picks a holiday-free week
  from the demo's own holiday list, work week and leave period (via its REST
  API). The pick also stays inside the current leave period: entitlements
  are per period, so a request crossing into next year is rejected. In the
  last weeks of December there may be no such week left, and the helper
  fails with a message saying so.
- **Pre-filled Employee Id collisions.** Add Employee pre-fills "the next
  free id" when the form opens. On the shared demo, another session can
  take it before Save, which then fails with "Employee Id already exists".
  Fixture employees now set their own id (`uniqueEmployeeId()`), the same
  way usernames were already made unique.
- **Login landing page.** After a logout, OrangeHRM sends the next login
  back to the last page visited in that browser, not always the dashboard.
  `LoginPage.login()` now waits to leave the login page rather than for a
  specific URL.
- **Stale balance responses.** Each date change on Apply Leave fires a
  balance API call, and the panel shows whichever response arrives last.
  Setting From and To back to back could let the "From only" answer
  overwrite "Balance not sufficient". The date setters in `ApplyLeavePage`
  now wait for the recalculation they triggered.

Writing the extra tests that close the AI spec reviewer's gaps also
corrected two specs. Entitlements are **added** on top of an existing value,
not replaced (`leave-balance-validation` AC-5), and Employee Id **is**
enforced unique (`employee-onboarding` edge cases). Each spec carries a
dated correction note.

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
