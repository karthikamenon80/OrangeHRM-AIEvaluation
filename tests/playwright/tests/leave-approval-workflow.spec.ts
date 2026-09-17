import { test, expect, Page, Browser } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AddEmployeePage } from '../pages/AddEmployeePage';
import { LeaveEntitlementPage } from '../pages/LeaveEntitlementPage';
import { ApplyLeavePage } from '../pages/ApplyLeavePage';
import { LeaveListPage } from '../pages/LeaveListPage';
import { MyLeavePage } from '../pages/MyLeavePage';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../utils/env';
import { STRONG_PASSWORD, uniqueUsername } from '../utils/testData';
import { addDays, nextMonday, toOhrmDate } from '../utils/dates';

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
  const monday = nextMonday();
  const fiveDayRange = { from: monday, to: addDays(monday, 4) }; // Mon-Fri = 5 working days
  const twoDayRange = { from: monday, to: addDays(monday, 1) }; // Mon-Tue = 2 working days

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    employeeUsername = uniqueUsername('qa_approval');
    const lastName = uniqueUsername('Approval');
    employeeFullName = `QA ${lastName}`;
    await addEmployee.enableLoginDetails();
    await addEmployee.fill({
      firstName: 'QA',
      lastName,
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
  // Spec AC-3: the approver's Reject is immediate (no confirmation prompt),
  // sets status "Rejected (N.00)", and fully restores the N reserved days.
  test('AC-1/AC-3: submitting reserves the balance; rejecting fully restores it', async () => {
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
    const pendingRow = myLeave.rowForDate(`${toOhrmDate(fiveDayRange.from)} to ${toOhrmDate(fiveDayRange.to)}`);
    await expect(pendingRow).toContainText('Pending Approval (5.00)');

    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await expect(applyLeave.leaveBalanceText).toHaveText('0.00 Day(s)');

    // AC-3
    await login.logout();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const leaveList = new LeaveListPage(page);
    await leaveList.goto();
    await leaveList.filterByEmployee(employeeFullName);
    await leaveList.reject(employeeFullName);
    await expect(leaveList.successToast).toBeVisible();

    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    await myLeave.goto();
    const rejectedRow = myLeave.rowForDate(`${toOhrmDate(fiveDayRange.from)} to ${toOhrmDate(fiveDayRange.to)}`);
    await expect(rejectedRow).toContainText('Rejected (5.00)');

    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await expect(applyLeave.leaveBalanceText).toHaveText('5.00 Day(s)');
  });

  // Spec AC-4: approving a pending request is immediate (no confirmation
  // prompt), sets status "Scheduled (N.00)", and the balance stays reduced
  // by N — approve does NOT refund, unlike reject in the previous scenario.
  test('AC-4: approving a pending request keeps the balance deducted', async () => {
    const login = new LoginPage(page);
    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    const applyLeave = new ApplyLeavePage(page);
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(twoDayRange.from));
    await applyLeave.setToDate(toOhrmDate(twoDayRange.to));
    await applyLeave.apply();
    await expect(applyLeave.successToast).toBeVisible();

    await login.logout();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const leaveList = new LeaveListPage(page);
    await leaveList.goto();
    await leaveList.filterByEmployee(employeeFullName);
    await leaveList.approve(employeeFullName);
    await expect(leaveList.successToast).toBeVisible();

    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    const myLeave = new MyLeavePage(page);
    await myLeave.goto();
    const row = myLeave.rowForDate(`${toOhrmDate(twoDayRange.from)} to ${toOhrmDate(twoDayRange.to)}`);
    await expect(row).toContainText('Scheduled (2.00)');

    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await expect(applyLeave.leaveBalanceText).toHaveText('3.00 Day(s)');
  });
});
