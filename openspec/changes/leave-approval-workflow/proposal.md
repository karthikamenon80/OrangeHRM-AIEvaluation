# Proposal: Leave Approval Workflow

Leave request/approve/reject is OrangeHRM's clearest cross-role workflow —
an employee (ESS) action changes state that a different role (a user with
leave-approval rights) must act on, with balance and dashboard-notification
side effects on both sides. We're specifying the actual observed
request → pending → approve/reject lifecycle so this workflow has a concrete,
testable contract for Playwright coverage and AI-judge evaluation, instead of
an assumed textbook approval flow.
