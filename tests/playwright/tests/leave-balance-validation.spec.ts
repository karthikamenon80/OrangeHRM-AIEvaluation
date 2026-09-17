import { test, expect, Page, Browser } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AddEmployeePage } from '../pages/AddEmployeePage';
import { LeaveEntitlementPage } from '../pages/LeaveEntitlementPage';
import { ApplyLeavePage } from '../pages/ApplyLeavePage';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../utils/env';
import { STRONG_PASSWORD, uniqueUsername } from '../utils/testData';
import { addDays, nextMonday, toOhrmDate } from '../utils/dates';

// Spec: openspec/changes/leave-balance-validation/spec.md
//
// These tests run in sequence against ONE fixture employee, created once in
// beforeAll, because several tests intentionally build on the balance state
// left by the previous one (e.g. AC-1's "no entitlement at all" must be
// checked before any entitlement exists for this employee). A single shared
// page carries the login session across role switches (admin <-> employee).
test.describe.serial('Leave Balance Validation', () => {
  let page: Page;
  let employeeFullName: string;
  let employeeUsername: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    employeeUsername = uniqueUsername('qa_balance');
    const lastName = uniqueUsername('Balance');
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
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Spec AC-1: an employee with no leave entitlement records at all sees
  // "No Leave Types with Leave Balance" and no Leave Type to select.
  test('AC-1: employee with zero entitlements sees "No Leave Types with Leave Balance"', async () => {
    const login = new LoginPage(page);
    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    const applyLeave = new ApplyLeavePage(page);
    await applyLeave.goto();

    await expect(applyLeave.noLeaveTypesMessage).toBeVisible();
  });

  // Spec AC-3: a negative Entitlement value is rejected with a number-format
  // error, not silently accepted or clamped to zero.
  // Spec AC-4: Entitlement = 0 is accepted and creates a real record visible
  // on the admin's Entitlements list — but (per the AC-4/AC-2 correction in
  // the spec) it does NOT make the leave type selectable on the employee's
  // Apply Leave screen, which still shows "No Leave Types with Leave
  // Balance" identically to AC-1's no-record state.
  test('AC-3/AC-4: negative entitlement is rejected, zero entitlement is accepted', async () => {
    const login = new LoginPage(page);
    await login.logout();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const entitlement = new LeaveEntitlementPage(page);
    await entitlement.goto();
    await entitlement.selectEmployee(employeeFullName);
    await entitlement.selectLeaveType('CAN - Vacation');
    await entitlement.setEntitlement('-5');
    await entitlement.save();

    // AC-3
    await expect(entitlement.entitlementError).toContainText('Should be a number with upto 2 decimal places');

    await entitlement.setEntitlement('0');
    await entitlement.save();
    await expect(entitlement.entitlementError).toHaveCount(0);

    // AC-4: the 0-day record is real and shows up on the admin list...
    await entitlement.gotoList();
    await entitlement.searchForEmployee(employeeFullName);
    await expect(entitlement.totalDaysText).toHaveText('Total 0.00 Day(s)');

    // ...but the employee's Apply Leave screen treats it the same as no
    // entitlement at all (AC-1), NOT as a selectable 0.00 balance.
    const login2 = new LoginPage(page);
    await login2.logout();
    await login2.login(employeeUsername, STRONG_PASSWORD);
    const applyLeave = new ApplyLeavePage(page);
    await applyLeave.goto();
    await expect(applyLeave.noLeaveTypesMessage).toBeVisible();
  });

  // Spec AC-6: requesting more days than the balance shows "Balance not
  // sufficient" client-side and is rejected server-side ("Leave Balance
  // Exceeded") — the Apply button is not disabled, so submission must be
  // attempted, not just the warning text checked.
  // Spec AC-8: To Date before From Date is blocked client-side with an
  // inline error; no server round trip occurs.
  // Spec AC-7: a request for exactly the remaining balance (5 working days
  // against a 5.00 balance) succeeds — the boundary is inclusive.
  test('AC-6/AC-8/AC-7: over-allocation blocked, invalid range blocked, exact boundary succeeds', async () => {
    const login = new LoginPage(page);
    await login.logout();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const entitlement = new LeaveEntitlementPage(page);
    // Replaces the 0.00 entitlement from the previous test (AC-5 replace
    // behavior — a confirm dialog is handled inside LeaveEntitlementPage.save()).
    await entitlement.grant(employeeFullName, 'CAN - Vacation', '5');

    const login2 = new LoginPage(page);
    await login2.logout();
    await login2.login(employeeUsername, STRONG_PASSWORD);

    const applyLeave = new ApplyLeavePage(page);
    const monday = nextMonday();

    // AC-6: three full weeks (15 working days) against a 5-day balance.
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(monday));
    await applyLeave.setToDate(toOhrmDate(addDays(monday, 18)));
    await expect(applyLeave.leaveBalanceText).toContainText('Balance not sufficient');
    await applyLeave.apply();
    await expect(applyLeave.errorToast).toBeVisible();

    // AC-8: To Date before From Date — inline error, no submission attempted.
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(addDays(monday, 10)));
    await applyLeave.setToDate(toOhrmDate(addDays(monday, 5)));
    await expect(applyLeave.toDateError).toHaveText('To date should be after from date');

    // AC-7: exactly Mon-Fri of the same week == 5 working days == balance.
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(monday));
    await applyLeave.setToDate(toOhrmDate(addDays(monday, 4)));
    await expect(applyLeave.leaveBalanceText).not.toContainText('Balance not sufficient');
    await applyLeave.apply();
    await expect(applyLeave.successToast).toBeVisible();
  });
});
