# Demo: proving the reviewer catches a real gap

This documents a controlled before/after test of the AI spec reviewer,
per the Day 3 requirement to "deliberately leave one gap... to prove the
reviewer catches it." Both runs used the real Claude API (`claude-sonnet-5`)
against the actual `leave-balance-validation` spec and test file — no output
here is fabricated. Raw JSON/Markdown for every run referenced below is
committed alongside this file in `baseline-reports/` and `gap-demo-reports/`.

## What was removed

In `tests/playwright/tests/leave-balance-validation.spec.ts`, the combined
test `AC-6/AC-8/AC-7: over-allocation blocked, invalid range blocked, exact
boundary succeeds` had its **AC-8 block** deleted — the six lines that
navigate to Apply Leave, set an invalid date range (To Date before From
Date), and assert the inline "To date should be after from date" error:

```diff
     await expect(applyLeave.errorToast).toBeVisible();

-    // AC-8: To Date before From Date — inline error, no submission attempted.
-    await applyLeave.goto();
-    await applyLeave.selectLeaveType('CAN - Vacation');
-    await applyLeave.setFromDate(toOhrmDate(addDays(monday, 10)));
-    await applyLeave.setToDate(toOhrmDate(addDays(monday, 5)));
-    await expect(applyLeave.toDateError).toHaveText('To date should be after from date');
-
     // AC-7: exactly Mon-Fri of the same week == 5 working days == balance.
     await applyLeave.goto();
```

Deliberately, the **test's own name and its top-of-test comment citing
"Spec AC-8" were left in place** — this is the realistic version of the gap:
a developer removed the check but didn't clean up the surrounding comments,
so the reviewer has to actually read the test body rather than trust the
comment. The Playwright suite was confirmed still green after the removal
(deleting an assertion block doesn't break the remaining ones) — this gap is
invisible to `npm test`, which is exactly why an AI reviewer that reads the
spec is useful here.

## Before (full coverage) — score 5/10

From `baseline-reports/leave-balance-validation.json` / `.md`:

> AC-8 also requires that "no server round trip occurs" when To Date is
> before From Date, and that the Leave Balance panel resets to 0.00. The
> test only checks the inline error text on toDateError; it does not verify
> that Apply was not clicked/no network round trip happened, nor that the
> balance panel resets to 0.00 as described in Observed Behavior.
>
> — category: `weak_assertion`, severity: **medium**

AC-8 was correctly identified as *present but shallow* — the check exists,
just doesn't cover every sub-claim the AC makes.

## After (AC-8 block removed) — score 4/10

From `gap-demo-reports/leave-balance-validation.json` / `.md`:

> AC-8 requires checking that (a) an inline "To date should be after from
> date" error appears, (b) the Leave Balance panel resets to 0.00, and (c)
> no server round trip occurs. The test file as written does not include
> any explicit scenario setting To Date before From Date at all — the
> comment block claims AC-8 is covered ("over-allocation blocked, invalid
> range blocked...") but no code in the test body sets an invalid date
> range, checks the inline error text, or checks the balance panel resets
> to 0.00. **This looks like an AC cited in the comment but never actually
> exercised.**
>
> — category: `weak_assertion`, severity: **high**

## What this proves

- The reviewer caught the removal **without the test suite itself failing**
  — `npx playwright test` was still green after the edit, since removing an
  assertion doesn't break anything by itself. Test-suite-green and
  spec-fully-covered are different claims, and this tool checks the second
  one.
- It correctly distinguished "covered but shallow" (before, medium severity)
  from "cited in a comment but not actually exercised in code" (after, high
  severity) — it read the test body, not just the comment, and called out
  the comment/code mismatch explicitly.
- The overall score moved 5 → 4, tracking the severity increase rather than
  just a gap being added or removed from a count.

## Restoring the gap

The six deleted lines were restored immediately after this demo. Confirmed
via `git diff` that the test file is byte-identical to its committed state,
and re-ran `npx playwright test tests/leave-balance-validation.spec.ts` to
confirm all 3 tests pass again (see project history — this demo did not
leave the suite in a degraded state).

## A second, unplanted finding worth noting

Running the reviewer for the first time (before this deliberate demo) also
surfaced a genuine, **not intentionally introduced** gap: `AC-9` (malformed
date text) had zero test coverage in the original Day 2 suite — nobody
removed it, it was simply never written. `AC-5` (the re-entitlement
confirmation dialog) was also flagged as only incidentally handled, with no
dedicated assertion on its dialog text or replace semantics. Both are
recorded in `baseline-reports/leave-balance-validation.json` at scores/gaps
consistent with the numbers above. These are left as-is (not fixed as part
of Day 3) since fixing them is Day 2 test-writing work, not reviewer-tool
work — but they're a real demonstration that this tool finds real problems,
not just the one planted for this demo.
