# Spec: Leave Balance Validation (Boundary & Edge Cases)

**System under test:** OrangeHRM Community, observed on the official public
demo (`opensource-demo.orangehrmlive.com`, OrangeHRM OS 5.9). Screens: Leave →
Entitlements → Add Entitlement (`/leave/addLeaveEntitlement`), Leave → Apply
Leave (`/leave/applyLeave`), as both `Admin` and a self-created ESS employee,
`QA Tester`.

## Observed behavior

### Zero balance — no entitlement at all
A brand-new employee/login with **no leave entitlement records of any leave
type** sees, on Apply Leave: **"No Leave Types with Leave Balance"** — the
entire form (date pickers, comments) is replaced by this message; there is no
Leave Type dropdown to even attempt a submission.

### Zero balance — an explicit 0.00 entitlement
Adding a leave entitlement with **Entitlement = 0** was **accepted** (no
inline error) and created a real entitlement record — confirmed visible on
the admin's **Leave → Entitlements** list (`CAN - Vacation | Added |
2026-01-01 | 2026-31-12 | 0`, "Total 0.00 Day(s)").

**Correction (re-verified while writing Playwright tests against this spec,
Day 2):** the initial Day 1 write-up of this section was wrong. A 0.00
entitlement does **not** make the leave type selectable on the employee's
Apply Leave screen — that screen still shows **"No Leave Types with Leave
Balance"**, identically to having no entitlement record at all (see above).
The "record exists but is 0" vs. "no record at all" distinction is real and
verifiable, but only from the **admin's Entitlements list**, not from the
employee-facing Apply Leave screen. Re-verified directly: granting a fresh
0.00 entitlement to a brand-new employee and immediately checking their
Apply Leave screen shows "No Leave Types with Leave Balance", not a
selectable "CAN - Vacation" with "0.00 Day(s)".

### Negative entitlement (admin-side allocation)
On Add Leave Entitlement, entering **Entitlement = -5** was rejected with:
**"Should be a number with upto 2 decimal places"** — i.e., the validation
message does not say "must be positive"; a leading minus sign fails the
number-format check outright rather than being caught by a separate
sign/range rule.

### Re-adding an entitlement for the same employee/type/period
Adding a second entitlement for a leave type/period that already has one
does **not** create a duplicate or silently overwrite — it shows an explicit
confirmation dialog: **"Updating Entitlement — Existing Entitlement value
X.00 will be updated to Y.00"** with Confirm/Cancel. Confirming replaces the
value (it is a replace, not an additive top-up).

### Over-allocation (requesting more than the balance)
With a balance of 5.00 days, entering a date range covering more working days
than the balance (Sep 21 – Oct 5, spanning multiple weeks) produced, live,
client-side, before any Apply click: the Leave Balance panel replaced its
numeric value with **"Balance not sufficient"** in red. Clicking **Apply**
anyway (button remains enabled) triggered a **server-side rejection**: error
toast **"Leave Balance Exceeded"**, and the form was reset — no partial or
capped request was created.

### Exact-balance boundary (request == balance, inclusive)
With a balance of exactly 5.00 days, requesting a date range totaling exactly
5 working days (Mon–Fri, Sep 21–25) showed **no** "insufficient" warning and
**succeeded** ("Successfully Saved"), confirming the boundary is **inclusive**
— a request equal to the remaining balance is allowed, not just strictly-less-than.

### Invalid date range (To Date before From Date)
Entering From Date = 2026-10-10 and To Date = 2026-05-10 (i.e., To before
From) produced an immediate inline error under the To Date field: **"To date
should be after from date"**, and the Leave Balance panel reset to `0.00`
(loses the previously-resolved balance context) until the dates are
corrected. No server round trip occurs for this case.

### Malformed date text
Typing free text into the date fields that doesn't resolve to a real
`yyyy-dd-mm` date produced inline error: **"Should be a valid date in
yyyy-dd-mm format"** under the affected field(s), independently for From and
To.

## Acceptance criteria

1. **AC-1**: Given an employee with zero leave entitlement records for any
   leave type, when they open Apply Leave, then the form shows "No Leave
   Types with Leave Balance" and offers no leave type to select.
2. **AC-2**: Given an employee with an explicit 0.00-day entitlement record
   for a leave type, when they open Apply Leave, then that leave type is
   still **not** selectable — the screen shows "No Leave Types with Leave
   Balance", the same as AC-1's no-record state. The 0.00 record is real and
   is visible on the admin's Entitlements list, but Apply Leave treats "an
   entitlement of zero" and "no entitlement at all" identically.
3. **AC-3**: Given the Add Leave Entitlement form, when a negative number is
   entered for Entitlement, then the save is blocked with a
   number-format error and no entitlement is created or updated.
4. **AC-4**: Given the Add Leave Entitlement form, when Entitlement = 0 is
   submitted, then the save succeeds and creates a 0.00-day entitlement
   record (distinguish from AC-3: zero is valid, negative is not).
5. **AC-5**: Given an employee already has an entitlement for a given leave
   type and period, when an admin adds another entitlement for the same
   employee/type/period, then a confirmation dialog names the existing and
   new values before any change is applied, and confirming replaces
   (not adds to) the existing value.
6. **AC-6**: Given a leave balance of N days, when a request for more than N
   working days is submitted, then the balance panel shows "Balance not
   sufficient" before submission, and submitting anyway is rejected
   server-side with a "Leave Balance Exceeded" error and no request is
   created.
7. **AC-7**: Given a leave balance of exactly N days, when a request for
   exactly N working days is submitted, then the request succeeds — the
   balance-sufficiency check is inclusive of equality, not strictly-less-than.
8. **AC-8**: Given the Apply Leave form, when To Date is before From Date,
   then an inline "To date should be after from date" error blocks
   submission and no server round trip occurs.
9. **AC-9**: Given the Apply Leave form, when an unparseable date is entered,
   then an inline "Should be a valid date in yyyy-dd-mm format" error is
   shown per affected field.

## Edge cases

- **"No entitlement record" vs. "0.00 entitlement" are different states in
  the data, but identical from the employee's Apply Leave screen** (AC-1 vs.
  AC-2) — both show "No Leave Types with Leave Balance". The distinction only
  surfaces on the admin's Entitlements list. A test (or a person) checking
  only Apply Leave will conclude, incorrectly, that no entitlement was ever
  created — this spec's own first draft made exactly that mistake before
  being re-verified.
- **Negative-number rejection message is generic**, not balance-specific
  ("Should be a number with upto 2 decimal places") — it reads the same as a
  malformed-decimal error, so this UI does not clearly communicate *why* a
  negative value specifically is invalid.
- **Fractional/decimal entitlements**: the validation message explicitly
  allows "up to 2 decimal places" (e.g., 0.5 days) — half-day and other
  fractional entitlements are implied to be valid; not independently
  re-verified with an actual fractional value in this pass (flagged as a
  follow-up).
- **Re-allocation is a destructive replace, not additive** — an admin
  re-running Add Entitlement for the same employee/type/period will silently
  lose the original value if they don't read the confirmation dialog
  carefully (it does show old → new values, but there's no way to add
  incrementally through this form).
- **Boundary is inclusive at exact match**, which is easy to get backwards
  when writing assertions (`>` vs `>=`) — explicitly worth a dedicated
  regression test given how easy this boundary is to flip during any future
  refactor of the balance-check logic.
- **Client-side "Balance not sufficient" is advisory, not enforcing** — the
  Apply button stays clickable and a real request attempt still reaches the
  server, which is the actual enforcement point ("Leave Balance Exceeded").
  A UI-only automated check that stops at the red text without also
  attempting submission would under-test this path.
- **Invalid date range resets balance context** — correcting an invalid To
  Date after seeing the "before from date" error requires re-selecting the
  leave type or dates to get the balance panel to repopulate; not confirmed
  whether balance re-displays automatically on correction alone (flagged as
  a follow-up).
