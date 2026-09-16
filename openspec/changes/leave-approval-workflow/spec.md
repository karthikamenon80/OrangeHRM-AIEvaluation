# Spec: Leave Approval Workflow

**System under test:** OrangeHRM Community, observed on the official public
demo (`opensource-demo.orangehrmlive.com`, OrangeHRM OS 5.9). Two accounts
used: `Admin` (admin/approver) and a self-created ESS employee, `QA Tester`
(screens: Leave → Apply, Leave → My Leave, Leave → Leave List).

## Observed behavior

### Employee side: submitting a request
On **Leave → Apply Leave**, the employee picks a Leave Type from a dropdown
that **only lists leave types the employee has a nonzero-or-existing
entitlement for**; From Date / To Date (format `yyyy-dd-mm`); an optional
Partial Days selector (appears once a valid date range is entered); and
Comments (optional). A live **Leave Balance** panel shows the current balance
for the selected leave type before submission.

Submitting a valid request (5-day range against a 5.00-day balance) returned
a **"Successfully Saved"** toast and immediately:
- Reserved the requested days against the balance — **My Leave** showed
  Leave Balance `0.00` and the row's own status as **"Pending Approval
  (5.00)"** (the number in parentheses is the day-count reserved by *this*
  request).
- Gave the employee a **Cancel** action on that pending row (no Approve/Reject
  options — those are approver-only).

### Approver side: notification
Logging in as `Admin` immediately after the submission, the Dashboard's **My
Actions** widget showed **"(1) Leave Request to Approve"** — this is the only
observed notification surface; no email/toast was generated at submission
time for the approver in this environment.

### Approver side: acting on a request
**Leave → Leave List**, filtered to "Pending Approval", showed the request
with inline **Approve** and **Reject** action buttons directly in the row —
no navigation to a detail page is required to act.

- Clicking **Reject** applied immediately, with **no confirmation dialog**,
  and returned a **"Successfully Updated"** toast. The row disappeared from
  the "Pending Approval" filter.
- Clicking **Approve** on a separate 2-day request behaved identically:
  immediate, no confirmation dialog, "Successfully Updated" toast.

### Resulting employee-side state
Re-checking **My Leave** as the employee after each action:
- The **rejected** request showed **Status: "Rejected (5.00)"**, and the
  **Leave Balance column reverted to 5.00** — rejection fully restores the
  reserved days to the balance.
- The **approved** request showed **Status: "Scheduled (2.00)"**, and the
  balance **remained reduced** (5.00 → 3.00 after the 2-day approval,
  reflecting the earlier reject having already restored the 5 days) — an
  approval keeps the days deducted rather than restoring them. The approved
  ("Scheduled") row retained a **Cancel** action for the employee; the
  rejected row did not offer any further employee action.

### Balance accounting sequence observed (concrete numbers)
1. Entitlement granted: 5.00 days, CAN - Vacation.
2. Apply for 5 days → balance shown as 0.00, status "Pending Approval (5.00)".
3. Reject → balance restored to 5.00, status "Rejected (5.00)".
4. Apply for 2 days → balance shown as 3.00, status "Pending Approval (2.00)".
5. Approve → balance stays 3.00, status "Scheduled (2.00)".

## Acceptance criteria

1. **AC-1**: Given an employee with a nonzero balance for a leave type, when
   they submit an Apply Leave request within that balance, then the request
   is saved with status "Pending Approval (N.00)" and the visible Leave
   Balance is immediately reduced by N — before any approver action.
2. **AC-2**: Given a submitted, still-pending leave request, then a user with
   approval rights sees a corresponding count in the Dashboard "My Actions"
   → "Leave Request to Approve" widget.
3. **AC-3**: Given a pending leave request in Leave List, when the approver
   clicks Reject, then the action applies immediately without a confirmation
   prompt, the status becomes "Rejected (N.00)", and the employee's leave
   balance for that type is restored by exactly N days.
4. **AC-4**: Given a pending leave request in Leave List, when the approver
   clicks Approve, then the action applies immediately without a
   confirmation prompt, the status becomes "Scheduled (N.00)", and the
   employee's leave balance remains reduced by N days (not restored).
5. **AC-5**: Given a request with status "Scheduled" (approved), then the
   employee retains a Cancel action on that request from My Leave.
6. **AC-6**: Given a request with status "Rejected", then the employee has no
   further action available on that row (no Cancel, no resubmit-in-place).
7. **AC-7**: Given the Leave List "Pending Approval" filter, then
   Approve/Reject actions are available inline on each row without opening a
   detail view.

## Edge cases

- **Reject vs. approve balance handling differ**: reject is a full refund of
  reserved days; approve is a permanent deduction until/unless a separate
  cancellation occurs. Any test suite must assert both directions
  independently — one is not the inverse-confirmation of the other.
- **No confirmation dialog on Approve/Reject**: both are single-click,
  immediately-effective actions server-side. This is a genuine UX risk
  surface (accidental clicks) worth flagging, not just a test note — there is
  no undo path shown other than the employee's own Cancel action on an
  approved ("Scheduled") item.
- **Notification is in-app only (observed)**: no toast/email was visible to
  the approver at the moment of submission; the only surfaced signal was the
  Dashboard "My Actions" pending count, which requires the approver to
  navigate to the dashboard or Leave List to discover new requests.
- **Leave Type dropdown scoping**: Apply Leave only lists leave types the
  employee currently has an entitlement record for at all (including a
  0.00 entitlement, per [[leave-balance-validation]]) — an employee with zero
  entitlement records of any kind sees no leave types and cannot apply
  (see `leave-balance-validation` spec for the exact messaging).
- **Cross-role dependency not fully isolated**: this demo environment did not
  expose a distinct "reporting manager" separate from Admin for the test
  employee, so approval was exercised via an Admin account with global
  approve rights rather than a scoped line-manager account. Manager-scoped
  approval (i.e., a supervisor who can only see/approve their own reports)
  is a follow-up to verify, not confirmed in this pass.
