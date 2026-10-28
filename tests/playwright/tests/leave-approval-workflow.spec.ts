import { test, expect, Page, Browser } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AddEmployeePage } from '../pages/AddEmployeePage';
import { DashboardPage } from '../pages/DashboardPage';
import { LeaveEntitlementPage } from '../pages/LeaveEntitlementPage';
import { ApplyLeavePage } from '../pages/ApplyLeavePage';
import { LeaveListPage } from '../pages/LeaveListPage';
import { MyLeavePage } from '../pages/MyLeavePage';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../utils/env';
import { STRONG_PASSWORD, uniqueEmployeeId, uniqueUsername } from '../utils/testData';
import { addDays, toOhrmDate } from '../utils/dates';
import { cleanWorkWeekMonday } from '../utils/leaveCalendar';
import { recordNativeDialogs } from '../utils/dialogs';

// Spec: openspec/changes/leave-approval-workflow/spec.md
//
// One continuous scenario, run in sequence, covering the full
// apply -> pending -> reject and apply -> pending -> approve lifecycle for a
// single fixture employee. The spec's own edge-case notes call out that
// reject (full balance refund) and approve (balance stays deducted) are NOT
// inverse confirmations of each other, so both directions are exercised
// end-to-end here rather than asserted in isolation.
test.describe.serial('Leave Approval Workflow', () => {
  let page: Page;
  let employeeFullName: string;
  let employeeUsername: string;
  // Set in beforeAll from the demo's own calendar: Mon-Fri of a week with
  // no public holidays, so the 5-day request really costs 5.00 days.
  let fiveDayRange: { from: Date; to: Date };
  let twoDayRange: { from: Date; to: Date };
  const rangeText = (r: { from: Date; to: Date }) => `${toOhrmDate(r.from)} to ${toOhrmDate(r.to)}`;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const monday = await cleanWorkWeekMonday(page);
    fiveDayRange = { from: monday, to: addDays(monday, 4) }; // Mon-Fri = 5 working days
    twoDayRange = { from: monday, to: addDays(monday, 1) }; // Mon-Tue = 2 working days

    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    employeeUsername = uniqueUsername('qa_approval');
    const lastName = uniqueUsername('Approval');
    employeeFullName = `QA ${lastName}`;
    await addEmployee.enableLoginDetails();
    await addEmployee.fill({
      firstName: 'QA',
      lastName,
      employeeId: uniqueEmployeeId(),
      username: employeeUsername,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    });
    await addEmployee.save();
    await addEmployee.waitForPersonalDetailsRedirect();

    const entitlement = new LeaveEntitlementPage(page);
    await entitlement.grant(employeeFullName, 'CAN - Vacation', '5');
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Spec AC-1: submitting a request within balance immediately reserves the
  // days — status "Pending Approval (N.00)" and the visible balance drops by
  // N before any approver action.
  // Spec AC-2: the pending request shows up in the approver's Dashboard
  // "My Actions" widget as a "Leave Request(s) to Approve" count, which
  // leads to the request itself.
  test('AC-1/AC-2: submitting reserves the balance and reaches the approver', async () => {
    const login = new LoginPage(page);
    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    const applyLeave = new ApplyLeavePage(page);
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(fiveDayRange.from));
    await applyLeave.setToDate(toOhrmDate(fiveDayRange.to));
    await applyLeave.apply();
    await expect(applyLeave.successToast).toBeVisible();

    // AC-1
    const myLeave = new MyLeavePage(page);
    await myLeave.goto();
    const pendingRow = myLeave.rowForDate(rangeText(fiveDayRange));
    await expect(pendingRow).toContainText('Pending Approval (5.00)');

    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await expect(applyLeave.leaveBalanceText).toHaveText('0.00 Day(s)');

    // AC-2: the count is global on the shared demo (other people's requests
    // add to it), so assert it is non-zero and that following it leads to
    // this employee's pending request.
    await login.logout();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.leaveRequestsToApprove).toBeVisible();
    await expect(dashboard.leaveRequestsToApprove).not.toHaveText(/^\(0\)/);
    await dashboard.leaveRequestsToApprove.click();
    await expect(page).toHaveURL(/leave\/viewLeaveList/);

    const leaveList = new LeaveListPage(page);
    await leaveList.filterByEmployee(employeeFullName);
    await expect(leaveList.rowForEmployee(employeeFullName)).toContainText('Pending Approval (5.00)');
  });

  // Spec AC-7: on the Leave List's default "Pending Approval" filter,
  // Approve/Reject are inline in the row — acting needs no detail page.
  // Spec AC-3: Reject is immediate (no confirmation prompt), sets status
  // "Rejected (N.00)", and fully restores the N reserved days.
  // Spec AC-6: a rejected request leaves the employee no further action on
  // that row (no Cancel).
  test('AC-7/AC-3/AC-6: inline Reject applies without a prompt, restores the balance, leaves no action', async () => {
    const leaveList = new LeaveListPage(page);
    await leaveList.goto();
    await leaveList.filterByEmployee(employeeFullName);

    // AC-7
    await expect(leaveList.approveButton(employeeFullName)).toBeVisible();
    await expect(leaveList.rejectButton(employeeFullName)).toBeVisible();

    // AC-3: no OrangeHRM modal and no browser dialog; the toast appears
    // straight away and we never leave the list.
    const dialogs = recordNativeDialogs(page);
    await leaveList.reject(employeeFullName);
    await expect(leaveList.successToast).toBeVisible();
    await expect(leaveList.confirmationDialog).toHaveCount(0);
    expect(dialogs.messages).toEqual([]);
    dialogs.stop();
    await expect(page).toHaveURL(/leave\/viewLeaveList/);

    const login = new LoginPage(page);
    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    const myLeave = new MyLeavePage(page);
    await myLeave.goto();
    const rejectedRow = myLeave.rowForDate(rangeText(fiveDayRange));
    await expect(rejectedRow).toContainText('Rejected (5.00)');
    // AC-6
    await expect(myLeave.cancelButton(rejectedRow)).toHaveCount(0);

    const applyLeave = new ApplyLeavePage(page);
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await expect(applyLeave.leaveBalanceText).toHaveText('5.00 Day(s)');
  });

  // Spec AC-4: approving a pending request is immediate (no confirmation
  // prompt), sets status "Scheduled (N.00)", and the balance stays reduced
  // by N — approve does NOT refund, unlike reject in the previous scenario.
  // Spec AC-5: the approved ("Scheduled") request keeps a Cancel action for
  // the employee.
  test('AC-4/AC-5: inline Approve applies without a prompt, keeps the balance deducted, keeps Cancel', async () => {
    const applyLeave = new ApplyLeavePage(page);
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(twoDayRange.from));
    await applyLeave.setToDate(toOhrmDate(twoDayRange.to));
    await applyLeave.apply();
    await expect(applyLeave.successToast).toBeVisible();

    const login = new LoginPage(page);
    await login.logout();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const leaveList = new LeaveListPage(page);
    await leaveList.goto();
    await leaveList.filterByEmployee(employeeFullName);

    // AC-4
    const dialogs = recordNativeDialogs(page);
    await leaveList.approve(employeeFullName);
    await expect(leaveList.successToast).toBeVisible();
    await expect(leaveList.confirmationDialog).toHaveCount(0);
    expect(dialogs.messages).toEqual([]);
    dialogs.stop();
    await expect(page).toHaveURL(/leave\/viewLeaveList/);

    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    const myLeave = new MyLeavePage(page);
    await myLeave.goto();
    const row = myLeave.rowForDate(rangeText(twoDayRange));
    await expect(row).toContainText('Scheduled (2.00)');
    // AC-5
    await expect(myLeave.cancelButton(row)).toBeVisible();

    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await expect(applyLeave.leaveBalanceText).toHaveText('3.00 Day(s)');
  });
});
