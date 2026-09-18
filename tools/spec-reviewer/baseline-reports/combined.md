### AI Spec Review — `employee-onboarding`

**Score: 5/10**

Core validation paths (AC-1, AC-3/4/5 combined, AC-6 partially) are covered with correct assertions matching observed behavior, and the two explicitly disclosed edge cases are appropriately left low-severity. However, AC-2, AC-7, and AC-8 have no citing tests at all, AC-6's redirect test doesn't verify the preserved name/Employee Id, AC-4's strength-badge assertion is omitted, and the undisclosed 'weak-but-long-enough-password' and 'non-unique Employee Id' edge cases are silently unexercised.

| Severity | Category | Reference | Description |
|---|---|---|---|
| 🔴 high | Missing AC coverage | `AC-2` | No test verifies that Save succeeds when only Middle Name and/or Employee Id are left empty. AC-1's test only asserts blocking when First AND Last Name are empty; nothing exercises the case where Middle Name/Employee Id are empty but First/Last Name are populated and Save succeeds. |
| 🟠 medium | Missing AC coverage | `AC-6` | The 'creates the employee and redirects' test checks a success toast and redirect but never asserts that the entered name and Employee Id are preserved on the Personal Details page, which is an explicit part of AC-6 ('with the entered name and Employee Id preserved'). |
| 🔴 high | Missing AC coverage | `AC-7` | No test covers the case where Create Login Details is left off and Save succeeds with only First Name + Last Name, with no login account created. This is a distinct scenario from AC-6 (which always enables login) and is not exercised. |
| 🟠 medium | Missing AC coverage | `AC-8` | No test verifies that additional Personal Details fields (Nationality, Marital Status, Date of Birth, Gender, Other Id, license fields, etc.) are optional and not enforced at onboarding time. This AC is entirely uncited and untested. |
| 🟠 medium | Weak assertion | `AC-4` | AC-4 requires asserting both the 'Should have at least 7 characters' error AND a 'Very Weak'-or-lower strength indicator. The test only checks the length error text via passwordError, but never asserts the strength badge label ('Very Weak') that the spec explicitly documents as part of the observed round trip. |
| 🟠 medium | Missing edge case | `Weak/short password boundary` | The edge case explicitly calls out that a password can be long enough to pass the length-7 check yet still be labeled weak by the strength meter (i.e., length and strength are independent signals). No test exercises a password that is >=7 characters but still weak to confirm this independence. |
| 🟠 medium | Missing edge case | `Non-unique Employee Id` | No test verifies that the Employee Id field is not re-validated for uniqueness (two employees could share the same Employee Id). This is an undisclosed-as-skipped edge case (not marked 'not exercised in this pass') and is silently missing from tests. |
| 🟡 low | Missing edge case | `Toggling Create Login Details off after entering data` | Spec explicitly discloses this as 'not exercised in this pass — flagged as a follow-up'. Correctly a disclosed gap, so low severity. |
| 🟡 low | Missing edge case | `Photo upload boundary (1MB / dimension limits)` | Spec explicitly discloses this as 'not exercised in this pass — flagged as a follow-up'. Correctly a disclosed gap, so low severity. |
| 🟠 medium | Weak assertion | `AC-7` | Since AC-7 has no dedicated test at all, there's no assertion confirming that no login account is created when Create Login Details is off — this would require checking absence of a username field submission or verifying via login attempt, which is not covered. |

---

### AI Spec Review — `leave-approval-workflow`

**Score: 6/10**

The two tests solidly cover the core balance-accounting round trips for AC-1, AC-3, and AC-4 with correct numeric assertions matching observed behavior. However, AC-2 (dashboard notification widget) is completely untested, AC-5/AC-6 (post-action row action availability) and AC-7 (inline action availability) are not explicitly verified, and the explicitly-called-out edge case of 'no confirmation dialog' is never asserted despite being flagged as a genuine risk in the spec.

| Severity | Category | Reference | Description |
|---|---|---|---|
| 🔴 high | Missing AC coverage | `AC-2` | No test checks the Dashboard 'My Actions' widget showing '(1) Leave Request to Approve' after a submission. This is entirely untested — no test logs into Admin's dashboard to verify the pending count before acting on the request. |
| 🟠 medium | Missing AC coverage | `AC-5` | No test verifies that the approved ('Scheduled') row retains a Cancel action for the employee. The test only checks the status text 'Scheduled (2.00)' and balance, not the presence of the Cancel button. |
| 🟠 medium | Missing AC coverage | `AC-6` | No test verifies that the rejected row has no further employee action (no Cancel button). Only the status text and balance are checked. |
| 🟡 low | Missing AC coverage | `AC-7` | No test explicitly verifies that Approve/Reject actions are available inline in the Leave List row without navigating to a detail page — the tests call leaveList.approve()/reject() helper methods but don't assert inline-availability or absence of navigation to a detail view. |
| 🟠 medium | Weak assertion | `AC-3` | The test does not assert the absence of a confirmation dialog when clicking Reject, which is an explicit part of AC-3 ('applies immediately without a confirmation prompt'). It only checks the resulting toast and balance restoration. |
| 🟠 medium | Weak assertion | `AC-4` | Similarly, AC-4 requires confirming no confirmation prompt appears on Approve; the test does not assert this explicitly. |
| 🟠 medium | Missing edge case | `No confirmation dialog on Approve/Reject` | The edge case explicitly flags the lack of a confirmation dialog as a UX risk worth asserting on, but no test verifies the absence of any dialog/prompt when clicking Approve or Reject. |
| 🟠 medium | Missing edge case | `Notification is in-app only (observed)` | Not tested at all — no test verifies that no toast/email is generated for the approver at submission time, nor that the Dashboard widget is the only notification surface. |
| 🟡 low | Missing edge case | `Leave Type dropdown scoping` | Not exercised in this test file, but this is explicitly disclosed as covered by a separate spec (leave-balance-validation), so it is a low-severity, disclosed gap here. |
| 🟡 low | Missing edge case | `Cross-role dependency not fully isolated` | Explicitly disclosed in the spec as a known follow-up (manager-scoped approval not verified). Correctly a disclosed, low-severity gap not covered by these tests. |