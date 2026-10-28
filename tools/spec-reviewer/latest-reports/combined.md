### AI Spec Review — `employee-onboarding`

**Score: 9/10**

Coverage is strong: every AC (AC-1 through AC-8) is explicitly cited and tested with assertions that match the observed behavior section (exact error text, strength labels, redirect behavior, login-account counts). The two disclosed-but-unexercised edge cases (toggle-off retention, photo upload limits) remain untested, consistent with the spec's own disclosure, and are correctly low severity. No contradictions were found between test assertions and observed behavior — exact strings like "Username already exists", "Should have at least 7 characters", "Very Weak", "Passwords do not match", and "Employee Id already exists" all match. Minor weak-assertion nitpicks exist around the "Strong" strength badge not being explicitly checked in the success path.

| Severity | Category | Reference | Description |
|---|---|---|---|
| 🟡 low | Missing edge case | `Edge case: Toggling Create Login Details off after entering data` | Spec explicitly discloses this as 'not exercised in this pass — flagged as a follow-up check'. No test exercises toggling login details off after entering username/password data to see if it's discarded or retained. This is a disclosed gap, so low severity per instructions. |
| 🟡 low | Missing edge case | `Edge case: Photo upload boundary (1MB / dimension limits)` | Spec explicitly discloses this as 'not exercised in this pass — flagged as a follow-up'. No test exercises photo upload size/type validation. Disclosed gap, so low severity. |
| 🟡 low | Weak assertion | `AC-6` | AC-6 requires the password be 'strong' and the test uses STRONG_PASSWORD from a utility, but no assertion checks that the strength chip actually displays 'Strong' during entry, unlike the weak-password test which does check the chip. This leaves the 'Strong' badge claim in AC-6 and observed behavior unverified by assertion. |
| 🟡 low | Weak assertion | `AC-2` | AC-2 is about Middle Name and Employee Id being optional. The test clears Employee Id but does not verify that leaving Middle Name empty is independently acceptable in a scenario where Employee Id is populated (i.e., it only tests both empty together), slightly conflating the two independent optional-field claims into one test. Minor, low-impact since the round trip is still directionally valid per AC-2 wording allowing either/both to be empty. |

---

### AI Spec Review — `leave-approval-workflow`

**Score: 9/10**

All seven ACs are explicitly cited in test comments and are exercised with concrete, spec-matching assertions (exact status strings like "Pending Approval (5.00)", "Rejected (5.00)", "Scheduled (2.00)", and exact balance values 0.00/5.00/3.00), matching the Observed Behavior section precisely with no contradictions found. The reject-vs-approve balance divergence edge case is well covered by running both flows independently in sequence as the spec demands, and the no-confirmation-dialog edge case is actively checked via native dialog recording. Minor gaps: the Leave Type dropdown scoping and cross-role/manager-approval edge cases remain unexercised (one disclosed as a follow-up, one only implicitly disclosed via cross-reference), and AC-2's assertion on the My Actions count is slightly shallow given the shared-environment caveat.

| Severity | Category | Reference | Description |
|---|---|---|---|
| 🟡 low | Missing edge case | `Edge case: No confirmation dialog on Approve/Reject` | The spec flags this as a genuine UX risk surface worth explicit attention, not just a note. Tests do check for absence of native dialogs and absence of a confirmation dialog element, which reasonably covers this edge case. No gap here beyond what's tested — covered adequately. |
| 🟡 low | Missing edge case | `Edge case: Leave Type dropdown scoping` | Not exercised in this spec's tests at all (no test checks that an employee with zero entitlement records sees no leave types). The spec explicitly defers exact messaging to the leave-balance-validation spec, but the scoping behavior itself (dropdown only lists leave types with an entitlement record) is a leave-approval-workflow edge case that is silently absent from this suite. It is partially disclosed via cross-reference but not explicitly marked 'not exercised in this pass' for this spec file. |
| 🟡 low | Missing edge case | `Edge case: Cross-role dependency not fully isolated` | This edge case is explicitly disclosed as a known follow-up not confirmed in this pass (manager-scoped approval not tested, Admin used as global approver instead). This is a disclosed gap, correctly reflected in the tests using Admin as approver, so low severity only for completeness tracking. |
| 🟡 low | Weak assertion | `AC-2` | AC-2 requires that 'a user with approval rights sees a corresponding count' in the My Actions widget. The test only asserts the widget is visible and not '(0)...', without verifying the count increments by exactly 1 relative to a pre-submission baseline. Since the demo environment is shared/global (as the test comment itself acknowledges), this is a reasonable compromise, but it means the assertion is weaker than the AC's literal 'corresponding count' language — it doesn't prove the number reflects this specific request, only that followed-through navigation reaches the correct employee's row. This is a reasonable practical tradeoff, so only minor weakness. |

---

### AI Spec Review — `leave-balance-validation`

**Score: 9/10**

Coverage is very strong: all 9 ACs are explicitly cited in test comments and are exercised with specific, observed-matching assertions (exact error strings, numeric boundaries like 5.00/8.00, inclusive boundary behavior, additive top-up semantics, and the AC-6 submission-not-just-warning check). No contradictions with the Observed Behavior section were found — strings, numbers, and status labels all match. The only gaps are two edge cases the spec itself already discloses as not-yet-verified follow-ups (fractional entitlements, balance panel auto-repopulation after date correction), which are appropriately low severity rather than true misses.

| Severity | Category | Reference | Description |
|---|---|---|---|
| 🟡 low | Missing edge case | `Edge case: Fractional/decimal entitlements` | Spec explicitly flags that fractional entitlements (e.g. 0.5 days) were not independently re-verified and marks this as a follow-up. No test exercises a fractional entitlement value. This is disclosed in the spec, so low severity. |
| 🟡 low | Missing edge case | `Edge case: Invalid date range resets balance context / whether balance re-displays automatically on correction` | Spec explicitly flags as a follow-up whether the balance panel re-populates automatically after correcting an invalid To Date (vs. requiring leave-type/date re-selection). No test exercises correcting the date after the AC-8 error to check balance panel behavior. Disclosed gap, so low severity. |
| 🟡 low | Weak assertion | `AC-6` | The spec's observed behavior says the Leave Balance panel shows 'Balance not sufficient' in red specifically as a live client-side computation before any Apply click. The test only asserts the text is present via toContainText, which is reasonable, but does not also verify the panel's prior/ normal numeric state transitions (e.g., that it initially showed a numeric balance before changing to 'Balance not sufficient'). This is a minor completeness point, not a strict contradiction, so logged as low-impact weak assertion risk. |