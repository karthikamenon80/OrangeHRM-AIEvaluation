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