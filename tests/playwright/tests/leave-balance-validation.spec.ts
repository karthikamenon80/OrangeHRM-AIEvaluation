import { test, expect, Page, Browser, Request } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AddEmployeePage } from '../pages/AddEmployeePage';
import { LeaveEntitlementPage } from '../pages/LeaveEntitlementPage';
import { ApplyLeavePage } from '../pages/ApplyLeavePage';
import { MyLeavePage } from '../pages/MyLeavePage';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../utils/env';
import { STRONG_PASSWORD, uniqueEmployeeId, uniqueUsername } from '../utils/testData';
import { addDays, toOhrmDate } from '../utils/dates';
import { cleanWorkWeekMonday } from '../utils/leaveCalendar';

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
  // A holiday-free Mon-Fri with 3 weeks of room left in the leave period
  // (AC-6 requests 3 weeks; AC-7 needs Mon-Fri to be exactly 5 working days).
  let monday: Date;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    monday = await cleanWorkWeekMonday(page, { spanDays: 18 });

    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    employeeUsername = uniqueUsername('qa_balance');
    const lastName = uniqueUsername('Balance');
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
    await expect(applyLeave.leaveTypeDropdown).toHaveCount(0);
  });

  // Spec AC-3: a negative Entitlement value is rejected with a number-format
  // error, not silently accepted or clamped to zero.
  // Spec AC-4: Entitlement = 0 is accepted and creates a real 0.00 record
  // visible on the admin's Entitlements list.
  // Spec AC-2: with that explicit 0.00 record in place, the employee's Apply
  // Leave screen still shows "No Leave Types with Leave Balance" — the same
  // as AC-1's no-record state — even though the admin list shows the record.
  test('AC-3/AC-4/AC-2: negative entitlement rejected, zero accepted, zero still not selectable', async () => {
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

    // AC-4: zero saves, leaving the add form for the employee's entitlement list.
    await entitlement.setEntitlement('0');
    await entitlement.save();
    await expect(entitlement.entitlementError).toHaveCount(0);
    await entitlement.gotoList();
    await entitlement.searchForEmployee(employeeFullName);
    await expect(entitlement.totalDaysText).toHaveText('Total 0.00 Day(s)');

    // AC-2: the employee's view treats that real 0.00 record like no record.
    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);
    const applyLeave = new ApplyLeavePage(page);
    await applyLeave.goto();
    await expect(applyLeave.noLeaveTypesMessage).toBeVisible();
    await expect(applyLeave.leaveTypeDropdown).toHaveCount(0);
  });

  // Spec AC-5: adding an entitlement for an employee/type/period that
  // already has one shows a dialog naming the existing and resulting values
  // before anything changes; confirming ADDS to the existing value and
  // cancelling leaves it alone. 0 -> 5 can't tell add from replace, so the
  // test then offers +3 on top of 5: the dialog must say 8.00 (a replace
  // would say 3.00), and cancelling must keep 5.00 — which is also the
  // balance the next test needs.
  test('AC-5: re-adding an entitlement shows old/resulting values and tops up; cancel changes nothing', async () => {
    const login = new LoginPage(page);
    await login.logout();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const entitlement = new LeaveEntitlementPage(page);
    const offer = async (days: string) => {
      await entitlement.goto();
      await entitlement.selectEmployee(employeeFullName);
      await entitlement.selectLeaveType('CAN - Vacation');
      await entitlement.setEntitlement(days);
      await entitlement.saveButton.click();
    };

    await offer('5');
    await expect(entitlement.replaceDialog).toContainText('Existing Entitlement value 0.00 will be updated to 5.00');
    await entitlement.confirmUpdateButton.click();
    await expect(entitlement.replaceDialog).toHaveCount(0);

    await offer('3');
    await expect(entitlement.replaceDialog).toContainText('Existing Entitlement value 5.00 will be updated to 8.00');
    await entitlement.replaceDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(entitlement.replaceDialog).toHaveCount(0);

    await entitlement.gotoList();
    await entitlement.searchForEmployee(employeeFullName);
    await expect(entitlement.totalDaysText).toHaveText('Total 5.00 Day(s)');
  });

  // Spec AC-6: requesting more days than the balance shows "Balance not
  // sufficient" client-side and is rejected server-side ("Leave Balance
  // Exceeded") with no request created — the Apply button is not disabled,
  // so submission must be attempted, not just the warning text checked.
  // Spec AC-8: To Date before From Date is blocked client-side with an
  // inline error, the balance panel resets to 0.00, and clicking Apply sends
  // no request to the server.
  // Spec AC-7: a request for exactly the remaining balance (5 working days
  // against a 5.00 balance) succeeds — the boundary is inclusive.
  test('AC-6/AC-8/AC-7: over-allocation blocked, invalid range blocked, exact boundary succeeds', async () => {
    // Balance is 5.00, left by the AC-5 test. (Granting 5 again here would
    // top it up to 10 — see the AC-5 correction in the spec.)
    const login = new LoginPage(page);
    await login.logout();
    await login.login(employeeUsername, STRONG_PASSWORD);

    const applyLeave = new ApplyLeavePage(page);
    const myLeave = new MyLeavePage(page);

    // AC-6: three full weeks (15 working days) against a 5-day balance.
    const tooLong = { from: monday, to: addDays(monday, 18) };
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(tooLong.from));
    await applyLeave.setToDate(toOhrmDate(tooLong.to));
    await expect(applyLeave.leaveBalanceText).toContainText('Balance not sufficient');
    await applyLeave.apply();
    await expect(applyLeave.errorToast).toContainText('Leave Balance Exceeded');
    await myLeave.goto();
    await expect(myLeave.rowForDate(`${toOhrmDate(tooLong.from)} to ${toOhrmDate(tooLong.to)}`)).toHaveCount(0);

    // AC-8: To Date before From Date — inline error, panel reset, no request sent.
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(addDays(monday, 10)));
    await applyLeave.setToDate(toOhrmDate(addDays(monday, 5)));
    await expect(applyLeave.toDateError).toHaveText('To date should be after from date');
    await expect(applyLeave.leaveBalanceText).toHaveText('0.00 Day(s)');
    const leavePosts: string[] = [];
    const onRequest = (r: Request) => {
      if (r.method() === 'POST' && r.url().includes('/api/v2/leave/')) leavePosts.push(r.url());
    };
    page.on('request', onRequest);
    await applyLeave.apply();
    await expect(applyLeave.toDateError).toHaveText('To date should be after from date');
    // Give any (unexpected) submission time to go out before checking.
    await page.waitForTimeout(1_500);
    page.off('request', onRequest);
    expect(leavePosts).toEqual([]);

    // AC-7: exactly Mon-Fri of a holiday-free week == 5 working days == balance.
    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(monday));
    await applyLeave.setToDate(toOhrmDate(addDays(monday, 4)));
    await expect(applyLeave.leaveBalanceText).toHaveText('5.00 Day(s)');
    await applyLeave.apply();
    await expect(applyLeave.successToast).toBeVisible();
    await myLeave.goto();
    await expect(myLeave.rowForDate(`${toOhrmDate(monday)} to ${toOhrmDate(addDays(monday, 4))}`)).toContainText(
      'Pending Approval (5.00)'
    );
  });

  // Spec AC-9: an unparseable date gets an inline "Should be a valid date in
  // yyyy-dd-mm format" error on each affected field independently. Each
  // field is made invalid while the other holds a VALID date: an empty
  // field also fails the format check once the form has been touched, so
  // "the other field shows no error" is only meaningful when it is filled.
  test('AC-9: an unparseable From or To date gets the format error on that field only', async () => {
    const formatError = 'Should be a valid date in yyyy-dd-mm format';
    const applyLeave = new ApplyLeavePage(page);

    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setToDate(toOhrmDate(addDays(monday, 4)));
    await applyLeave.setFromDate('2026-99-99');
    await expect(applyLeave.fromDateError).toHaveText(formatError);
    await expect(applyLeave.toDateError).toHaveCount(0);

    await applyLeave.goto();
    await applyLeave.selectLeaveType('CAN - Vacation');
    await applyLeave.setFromDate(toOhrmDate(monday));
    await applyLeave.setToDate('not-a-date');
    await expect(applyLeave.toDateError).toHaveText(formatError);
    await expect(applyLeave.fromDateError).toHaveCount(0);
  });
});
